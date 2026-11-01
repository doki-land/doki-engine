//! Unified content → route → site model.
//!
//! [`SiteModel`] is the single authority for content identity, page type,
//! authored route, output file, public URL and publish state. Themes, body
//! link rewriting, navigation, canonical URLs, sitemap, feed and search read
//! it instead of rebuilding `/pages/<id>.html` URLs themselves.
//!
//! Route keys strip the leading `YYYY-MM-DD-` date prefix from post filenames
//! and let `index` files own their directory. External destinations
//! (`http(s):`, `mailto:`, protocol-relative `//…`), pure fragments and hrefs
//! that match no content node are left untouched by [`SiteModel::resolve_link`].

use std::collections::btree_map::Entry;
use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::diagnostic::{Diagnostic, Severity};
use crate::graph::{ContentGraph, ContentId, ContentNode};
use crate::i18n::is_valid_locale_id;

/// Stable diagnostic code for two contents mapping to one route.
pub const ROUTE_CONFLICT_CODE: &str = "doki.site.route-conflict";
/// Stable diagnostic code for an unrecognized front matter `type`.
pub const INVALID_TYPE_CODE: &str = "doki.site.invalid-type";
/// Stable diagnostic code for a front matter `lang` that is not a locale id.
pub const INVALID_LOCALE_CODE: &str = "doki.site.invalid-locale";
/// Stable diagnostic code for a derived taxonomy route already owned by content.
pub const TAXONOMY_CONFLICT_CODE: &str = "doki.site.taxonomy-conflict";
/// Synthetic content id of the derived `/tags/` index page.
pub const TAGS_INDEX_ID: &str = "taxonomy:tags";

/// Page kind derived from front matter and content location.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PageType {
    Home,
    Post,
    Page,
}

/// One renderable content with its route, output file, URL and page metadata.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SitePage {
    pub id: ContentId,
    pub rel_path: String,
    /// Serialized as `type` because templates and plugins consume `page.type`.
    #[serde(rename = "type")]
    pub page_type: PageType,
    /// Authored route key (`/`, `/about/`, `/posts/welcome-to-fate/`).
    pub route: String,
    /// Output-relative file (`pages/posts/welcome-to-fate.html`).
    pub output: String,
    /// Public URL (`/<output>`).
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub date: Option<String>,
    pub draft: bool,
    /// Raw front matter `tags` sequence (empty when the content declares none).
    pub tags: Vec<String>,
    /// Resolved page locale: front matter `lang` when it is a valid locale id,
    /// otherwise the site default locale.
    pub locale: String,
}

/// One tag row on the derived `/tags/` index page.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagEntry {
    /// Normalized slug.
    pub tag: String,
    /// Display name: first raw tag (content-id order) normalizing to `tag`.
    pub display: String,
    /// Public URL owning `/tags/<slug>/` (derived page, or content that won it).
    pub url: String,
    /// Publishable posts carrying this tag under the active draft mode.
    pub count: usize,
}

/// Derived aggregate payload for a synthetic taxonomy page id.
#[derive(Debug, Clone, PartialEq)]
pub enum TaxonomyView {
    /// `/tags/` index listing every tag with its count.
    TagIndex(Vec<TagEntry>),
    /// `/tags/<slug>/` page listing member posts in `site.posts` order.
    Tag {
        slug: String,
        display: String,
        url: String,
        posts: Vec<ContentId>,
    },
}

/// Immutable site index built once per build from the full content graph.
#[derive(Debug, Clone)]
pub struct SiteModel {
    /// Content pages in content-id order, then derived taxonomy pages.
    pages: Vec<SitePage>,
    /// Content rel path → index into `pages`.
    by_rel: BTreeMap<String, usize>,
    /// Authored route → index into `pages` (conflicted routes are absent).
    by_route: BTreeMap<String, usize>,
    /// Synthetic taxonomy ids → aggregate payload.
    taxonomies: BTreeMap<ContentId, TaxonomyView>,
    /// Number of leading `pages` entries backed by content.
    content_len: usize,
}

impl SiteModel {
    /// Index every node of `graph` in content-id order, then derive the tag
    /// taxonomy aggregate pages from the post collection.
    ///
    /// Invalid front matter `type` values and duplicate routes are reported as
    /// [`Diagnostic`]s; a conflicted route is left ambiguous instead of
    /// silently picking the first node. A taxonomy route already owned by
    /// content keeps the content page and reports a
    /// [`TAXONOMY_CONFLICT_CODE`] Warning. Draft posts join the aggregates only
    /// when `include_drafts` matches the build mode.
    ///
    /// Every page resolves its locale from front matter `lang` (falling back to
    /// `default_locale` when absent or invalid, with an
    /// [`INVALID_LOCALE_CODE`] Warning). Non-default locales prefix the route
    /// with `/{locale}/`; the default locale keeps the authored route
    /// unprefixed. All locales share one route table, so a prefixed route
    /// colliding with any other page follows the same conflict rule.
    pub fn build(
        graph: &ContentGraph,
        include_drafts: bool,
        default_locale: &str,
    ) -> (Self, Vec<Diagnostic>) {
        let mut diagnostics = Vec::new();
        let mut pages: Vec<SitePage> = Vec::with_capacity(graph.len());
        let mut by_rel = BTreeMap::new();
        let mut by_route = BTreeMap::new();
        let mut conflicted = BTreeSet::new();

        for node in graph.nodes.values() {
            let page_type = derive_page_type(node, &mut diagnostics);
            let locale = resolve_locale(node, default_locale, &mut diagnostics);
            let base_route = route_of(&node.rel_path);
            let route = if locale == default_locale {
                base_route
            } else {
                format!("/{locale}{base_route}")
            };
            let output = output_rel(&node.rel_path);
            let url = format!("/{output}");
            let index = pages.len();

            if !conflicted.contains(&route) {
                match by_route.entry(route.clone()) {
                    Entry::Vacant(slot) => {
                        slot.insert(index);
                    }
                    Entry::Occupied(slot) => {
                        let previous = &pages[*slot.get()];
                        diagnostics.push(Diagnostic {
                            code: ROUTE_CONFLICT_CODE.into(),
                            severity: Severity::Error,
                            message: format!(
                                "content `{}` and `{}` both map to route `{route}`",
                                previous.rel_path, node.rel_path
                            ),
                            file: Some(node.rel_path.clone()),
                            help: Some(
                                "give one of the contents a distinct path or remove the other"
                                    .into(),
                            ),
                            plugin: None,
                            phase: None,
                        });
                        slot.remove();
                        conflicted.insert(route.clone());
                    }
                }
            }

            by_rel.insert(node.rel_path.clone(), index);
            pages.push(SitePage {
                id: node.id.clone(),
                rel_path: node.rel_path.clone(),
                page_type,
                route,
                url,
                output,
                title: node.front_matter.title.clone(),
                description: node.front_matter.description.clone(),
                date: node.front_matter.date.clone(),
                draft: node.front_matter.draft,
                tags: node.front_matter.tags.clone(),
                locale,
            });
        }

        let mut taxonomies = BTreeMap::new();
        let content_len = derive_tag_taxonomies(
            &mut pages,
            &mut by_route,
            &mut taxonomies,
            include_drafts,
            default_locale,
            &mut diagnostics,
        );

        (
            Self {
                pages,
                by_rel,
                by_route,
                taxonomies,
                content_len,
            },
            diagnostics,
        )
    }

    /// Every page: content pages in content-id order, then derived taxonomy
    /// pages (index first, then tag pages by slug).
    pub fn pages(&self) -> &[SitePage] {
        &self.pages
    }

    /// Content-backed pages only, in content-id order.
    pub fn content_pages(&self) -> &[SitePage] {
        &self.pages[..self.content_len]
    }

    /// Derived aggregate payload for a synthetic taxonomy page id.
    pub fn taxonomy(&self, id: &ContentId) -> Option<&TaxonomyView> {
        self.taxonomies.get(id)
    }

    /// Page of a content rel path.
    pub fn page(&self, rel: &str) -> Option<&SitePage> {
        self.by_rel.get(rel).map(|index| &self.pages[*index])
    }

    /// Page owning an authored route key; ambiguous (conflicted) routes are `None`.
    pub fn route_target(&self, route: &str) -> Option<&SitePage> {
        self.by_route.get(route).map(|index| &self.pages[*index])
    }

    /// Post collection: `post` pages only, newest date first, then route.
    ///
    /// Drafts are included only when `include_drafts` matches the build mode.
    pub fn posts(&self, include_drafts: bool) -> Vec<&SitePage> {
        let mut posts: Vec<&SitePage> = self
            .pages
            .iter()
            .filter(|page| page.page_type == PageType::Post && (include_drafts || !page.draft))
            .collect();
        posts.sort_by(|a, b| b.date.cmp(&a.date).then_with(|| a.route.cmp(&b.route)));
        posts
    }

    /// Resolve one authored link destination against the current node's
    /// location. `Some(url)` replaces the destination, `None` keeps it verbatim.
    pub fn resolve_link(&self, href: &str, from_rel: &str) -> Option<String> {
        let href = href.trim();
        if href.is_empty() {
            return None;
        }
        let (path, suffix) = match href.find(['#', '?']) {
            Some(index) => (&href[..index], &href[index..]),
            None => (href, ""),
        };
        if path.is_empty() || is_external(path) {
            return None;
        }
        let key = route_key_for(path, from_rel)?;
        let page = self.route_target(&key)?;
        Some(format!("{}{suffix}", page.url))
    }
}

/// Synthetic taxonomy page id for one tag slug.
pub(crate) fn tag_page_id(slug: &str) -> ContentId {
    ContentId(format!("taxonomy:tag/{slug}"))
}

/// Trim, lowercase and collapse every whitespace run into a single `-`.
pub(crate) fn normalize_tag_slug(raw: &str) -> String {
    let mut out = String::new();
    let mut pending_dash = false;
    for ch in raw.trim().chars() {
        if ch.is_whitespace() {
            pending_dash = !out.is_empty();
            continue;
        }
        if pending_dash {
            out.push('-');
            pending_dash = false;
        }
        out.extend(ch.to_lowercase());
    }
    out
}

/// Derive `/tags/` and `/tags/<slug>/` aggregate pages from the post
/// collection and register them in the same route table. Returns the number of
/// content pages that preceded the appended taxonomy pages.
///
/// Content wins every contested route: the aggregate is skipped and a
/// [`TAXONOMY_CONFLICT_CODE`] Warning names the occupying content rel path.
/// Index entries sort by count descending then slug ascending; member posts
/// keep `site.posts` order (date descending then route ascending).
fn derive_tag_taxonomies(
    pages: &mut Vec<SitePage>,
    by_route: &mut BTreeMap<String, usize>,
    taxonomies: &mut BTreeMap<ContentId, TaxonomyView>,
    include_drafts: bool,
    default_locale: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> usize {
    let content_len = pages.len();
    // Route owners are snapshotted before `pages` grows with taxonomy entries.
    let owners: Vec<(String, String)> = pages
        .iter()
        .map(|page| (page.rel_path.clone(), page.url.clone()))
        .collect();

    // Group member posts per slug; display keeps the first raw tag in
    // content-id order.
    let mut display: BTreeMap<String, String> = BTreeMap::new();
    let mut members: BTreeMap<String, Vec<usize>> = BTreeMap::new();
    for (index, page) in pages.iter().enumerate() {
        if page.page_type != PageType::Post || (page.draft && !include_drafts) {
            continue;
        }
        let mut seen_in_post = BTreeSet::new();
        for raw in &page.tags {
            let slug = normalize_tag_slug(raw);
            if slug.is_empty() || !seen_in_post.insert(slug.clone()) {
                continue;
            }
            display.entry(slug.clone()).or_insert_with(|| raw.clone());
            members.entry(slug).or_default().push(index);
        }
    }
    if members.is_empty() {
        return content_len;
    }

    // Member ordering mirrors `site.posts` (date desc, then route asc).
    let mut ordered: Vec<usize> = members
        .values()
        .flat_map(|ids| ids.iter().copied())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    ordered.sort_by(|&a, &b| {
        pages[b]
            .date
            .cmp(&pages[a].date)
            .then_with(|| pages[a].route.cmp(&pages[b].route))
    });
    let ranks: BTreeMap<usize, usize> = ordered
        .into_iter()
        .enumerate()
        .map(|(rank, index)| (index, rank))
        .collect();
    for ids in members.values_mut() {
        ids.sort_by_key(|index| ranks[index]);
    }

    let index_route = "/tags/".to_string();
    let index_output = "pages/tags.html".to_string();
    let mut index_entries: Vec<TagEntry> = Vec::new();
    let index_registered = match by_route.get(&index_route) {
        Some(&occupied) => {
            diagnostics.push(taxonomy_conflict_warning(&index_route, &owners[occupied].0));
            false
        }
        None => {
            by_route.insert(index_route.clone(), pages.len());
            pages.push(SitePage {
                id: ContentId(TAGS_INDEX_ID.into()),
                rel_path: index_output.clone(),
                page_type: PageType::Page,
                route: index_route,
                output: index_output.clone(),
                url: format!("/{index_output}"),
                title: None,
                description: None,
                date: None,
                draft: false,
                tags: Vec::new(),
                locale: default_locale.to_string(),
            });
            true
        }
    };

    for (slug, ids) in members {
        let route = format!("/tags/{slug}/");
        let output = format!("pages/tags/{slug}.html");
        let (url, owner_is_content) = match by_route.get(&route) {
            Some(&occupied) => {
                diagnostics.push(taxonomy_conflict_warning(&route, &owners[occupied].0));
                (owners[occupied].1.clone(), true)
            }
            None => {
                let url = format!("/{output}");
                by_route.insert(route.clone(), pages.len());
                pages.push(SitePage {
                    id: tag_page_id(&slug),
                    rel_path: output.clone(),
                    page_type: PageType::Page,
                    route,
                    output,
                    url: url.clone(),
                    title: Some(display[&slug].clone()),
                    description: None,
                    date: None,
                    draft: false,
                    tags: Vec::new(),
                    locale: default_locale.to_string(),
                });
                (url, false)
            }
        };
        index_entries.push(TagEntry {
            tag: slug.clone(),
            display: display[&slug].clone(),
            url: url.clone(),
            count: ids.len(),
        });
        if !owner_is_content {
            let view = TaxonomyView::Tag {
                slug: slug.clone(),
                display: display[&slug].clone(),
                url,
                posts: ids
                    .into_iter()
                    .map(|index| pages[index].id.clone())
                    .collect(),
            };
            taxonomies.insert(tag_page_id(&slug), view);
        }
    }

    if index_registered {
        index_entries.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.tag.cmp(&b.tag)));
        taxonomies.insert(
            ContentId(TAGS_INDEX_ID.into()),
            TaxonomyView::TagIndex(index_entries),
        );
    }
    content_len
}

fn taxonomy_conflict_warning(route: &str, rel: &str) -> Diagnostic {
    Diagnostic {
        code: TAXONOMY_CONFLICT_CODE.into(),
        severity: Severity::Warning,
        message: format!(
            "content `{rel}` already owns the taxonomy route `{route}`; the derived aggregate page is skipped"
        ),
        file: Some(rel.into()),
        help: Some(
            "rename or remove the content so the derived aggregate page can take the route".into(),
        ),
        plugin: None,
        phase: None,
    }
}

/// Output-relative HTML path for a content rel path (`pages/posts/a.html`).
pub(crate) fn output_rel(rel_path: &str) -> String {
    let without_ext = rel_path
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(rel_path);
    format!("pages/{without_ext}.html")
}

/// Page type precedence: front matter `type`, `layout: post`, root `index.md`,
/// first directory segment `posts`, otherwise `page`.
fn derive_page_type(node: &ContentNode, diagnostics: &mut Vec<Diagnostic>) -> PageType {
    let front_matter = &node.front_matter;
    if let Some(raw) = front_matter.page_type.as_deref() {
        match raw.trim().to_ascii_lowercase().as_str() {
            "home" => return PageType::Home,
            "post" => return PageType::Post,
            "page" => return PageType::Page,
            _ => diagnostics.push(Diagnostic {
                code: INVALID_TYPE_CODE.into(),
                severity: Severity::Warning,
                message: format!(
                    "content `{}` declares unknown front matter `type` `{raw}`",
                    node.rel_path
                ),
                file: Some(node.rel_path.clone()),
                help: Some("expected `home`, `post`, or `page`".into()),
                plugin: None,
                phase: None,
            }),
        }
    }
    if front_matter
        .layout
        .as_deref()
        .map_or(false, |layout| layout.trim().eq_ignore_ascii_case("post"))
    {
        return PageType::Post;
    }
    if node.rel_path.eq_ignore_ascii_case("index.md") {
        return PageType::Home;
    }
    if node.rel_path.split('/').next() == Some("posts") {
        return PageType::Post;
    }
    PageType::Page
}

/// Page locale: trimmed front matter `lang` when it is a valid locale id,
/// otherwise `default_locale`. A non-empty but invalid value reports an
/// [`INVALID_LOCALE_CODE`] Warning naming the offending declaration.
fn resolve_locale(node: &ContentNode, default_locale: &str, diagnostics: &mut Vec<Diagnostic>) -> String {
    let Some(raw) = node.front_matter.lang.as_deref() else {
        return default_locale.to_string();
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return default_locale.to_string();
    }
    if is_valid_locale_id(trimmed) {
        return trimmed.to_string();
    }
    diagnostics.push(Diagnostic {
        code: INVALID_LOCALE_CODE.into(),
        severity: Severity::Warning,
        message: format!(
            "content `{}` declares invalid front matter `lang` `{raw}`",
            node.rel_path
        ),
        file: Some(node.rel_path.clone()),
        help: Some(
            "use a BCP-47 style locale id such as `en`, `zh` or `zh-CN`; the page falls back to the site default locale"
                .into(),
        ),
        plugin: None,
        phase: None,
    });
    default_locale.to_string()
}

/// Route key of a content rel path: `/[<dir>/]<slug>/` with the date prefix
/// stripped; `index` files own their directory (`index.md` → `/`).
fn route_of(rel: &str) -> String {
    let (dir, file) = match rel.rfind('/') {
        Some(index) => (&rel[..index + 1], &rel[index + 1..]),
        None => ("", rel),
    };
    let stem = match file.rfind('.') {
        Some(index) => &file[..index],
        None => file,
    };
    if stem.eq_ignore_ascii_case("index") {
        return format!("/{dir}");
    }
    format!("/{dir}{}/", strip_date_prefix(stem))
}

/// Drop a leading `YYYY-MM-DD-` prefix from a filename stem.
fn strip_date_prefix(stem: &str) -> &str {
    let bytes = stem.as_bytes();
    let dated = bytes.len() > 11
        && bytes[..4].iter().all(u8::is_ascii_digit)
        && bytes[4] == b'-'
        && bytes[5..7].iter().all(u8::is_ascii_digit)
        && bytes[7] == b'-'
        && bytes[8..10].iter().all(u8::is_ascii_digit)
        && bytes[10] == b'-';
    if dated {
        let slug = &stem[11..];
        if !slug.is_empty() {
            return slug;
        }
    }
    stem
}

/// `mailto:`, `http:` and friends: a scheme appears before the first slash, or
/// the destination is protocol-relative.
fn is_external(path: &str) -> bool {
    if path.starts_with("//") {
        return true;
    }
    match path.find(':') {
        Some(colon) => path.find('/').map_or(true, |slash| colon < slash),
        None => false,
    }
}

/// Normalize an authored href (relative or root-absolute) into a route key.
fn route_key_for(path: &str, from_rel: &str) -> Option<String> {
    let joined = if let Some(rest) = path.strip_prefix('/') {
        rest.to_string()
    } else {
        let dir = match from_rel.rfind('/') {
            Some(index) => &from_rel[..index + 1],
            None => "",
        };
        format!("{dir}{path}")
    };
    let mut segments: Vec<&str> = Vec::new();
    for segment in joined.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                segments.pop();
            }
            other => segments.push(other),
        }
    }
    if segments.is_empty() {
        return Some("/".into());
    }
    Some(format!("/{}/", segments.join("/")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::frontmatter::FrontMatter;
    use crate::graph::{ContentKind, FrontMatterDto};
    use std::path::PathBuf;

    fn node(rel: &str, front_matter: FrontMatter) -> ContentNode {
        ContentNode {
            id: ContentId(rel.into()),
            path: PathBuf::from(rel),
            rel_path: rel.into(),
            kind: ContentKind::Markdown,
            front_matter: FrontMatterDto::from(front_matter),
            body: String::new(),
            content_hash: "x".into(),
        }
    }

    fn graph(nodes: Vec<ContentNode>) -> ContentGraph {
        let mut graph = ContentGraph::default();
        for node in nodes {
            graph.insert(node);
        }
        graph
    }

    fn plain(rel: &str) -> ContentNode {
        node(rel, FrontMatter::default())
    }

    fn typed(rel: &str, page_type: &str) -> ContentNode {
        node(
            rel,
            FrontMatter {
                page_type: Some(page_type.into()),
                ..FrontMatter::default()
            },
        )
    }

    fn post(rel: &str, date: &str, draft: bool) -> ContentNode {
        node(
            rel,
            FrontMatter {
                date: Some(date.into()),
                draft,
                ..FrontMatter::default()
            },
        )
    }

    fn model(nodes: Vec<ContentNode>) -> SiteModel {
        SiteModel::build(&graph(nodes), false, "en").0
    }

    fn tagged_post(rel: &str, date: &str, tags: &[&str], draft: bool) -> ContentNode {
        node(
            rel,
            FrontMatter {
                date: Some(date.into()),
                draft,
                tags: tags.iter().map(|tag| (*tag).to_string()).collect(),
                ..FrontMatter::default()
            },
        )
    }

    #[test]
    fn type_derivation_follows_precedence() {
        let (model, diagnostics) = SiteModel::build(
            &graph(vec![
                plain("index.md"),
                plain("about.md"),
                plain("notes/deep.md"),
                plain("posts/2025-06-15-welcome.md"),
                plain("posts/index.md"),
                node(
                    "guides/hello.md",
                    FrontMatter {
                        layout: Some("post".into()),
                        ..FrontMatter::default()
                    },
                ),
                typed("posts/override.md", "page"),
                typed("about-home.md", "home"),
            ]),
            false,
            "en",
        );
        assert!(diagnostics.is_empty(), "{diagnostics:?}");
        assert_eq!(model.page("index.md").unwrap().page_type, PageType::Home);
        assert_eq!(model.page("about.md").unwrap().page_type, PageType::Page);
        assert_eq!(
            model.page("notes/deep.md").unwrap().page_type,
            PageType::Page
        );
        assert_eq!(
            model.page("posts/2025-06-15-welcome.md").unwrap().page_type,
            PageType::Post
        );
        assert_eq!(
            model.page("posts/index.md").unwrap().page_type,
            PageType::Post
        );
        assert_eq!(
            model.page("guides/hello.md").unwrap().page_type,
            PageType::Post,
            "`layout: post` promotes before the directory rule"
        );
        assert_eq!(
            model.page("posts/override.md").unwrap().page_type,
            PageType::Page,
            "front matter `type` wins over the directory rule"
        );
        assert_eq!(
            model.page("about-home.md").unwrap().page_type,
            PageType::Home
        );
    }

    #[test]
    fn unknown_type_reports_a_diagnostic_without_guessing() {
        let (model, diagnostics) = SiteModel::build(
            &graph(vec![
                typed("about.md", "article"),
                typed("posts/a.md", "blog"),
            ]),
            false,
            "en",
        );
        assert_eq!(diagnostics.len(), 2, "{diagnostics:?}");
        assert!(diagnostics
            .iter()
            .all(|d| d.code == INVALID_TYPE_CODE && d.severity == Severity::Warning));
        assert!(diagnostics[0].message.contains("article"));
        assert!(diagnostics[1].message.contains("blog"));
        assert_eq!(model.page("about.md").unwrap().page_type, PageType::Page);
        assert_eq!(model.page("posts/a.md").unwrap().page_type, PageType::Post);
    }

    #[test]
    fn routes_strip_dates_and_index_owns_its_directory() {
        assert_eq!(route_of("index.md"), "/");
        assert_eq!(route_of("about.md"), "/about/");
        assert_eq!(
            route_of("posts/2025-06-15-welcome-to-fate.md"),
            "/posts/welcome-to-fate/"
        );
        assert_eq!(route_of("blog/index.md"), "/blog/");
        assert_eq!(route_of("notes/plain.MD"), "/notes/plain/");
        assert_eq!(strip_date_prefix("2025-06-15"), "2025-06-15");
    }

    #[test]
    fn output_and_url_follow_the_content_path() {
        let model = model(vec![
            plain("index.md"),
            plain("posts/2025-06-15-welcome-to-fate.md"),
        ]);
        let home = model.page("index.md").unwrap();
        assert_eq!(home.output, "pages/index.html");
        assert_eq!(home.url, "/pages/index.html");
        let post = model.page("posts/2025-06-15-welcome-to-fate.md").unwrap();
        assert_eq!(post.output, "pages/posts/2025-06-15-welcome-to-fate.html");
        assert_eq!(post.url, "/pages/posts/2025-06-15-welcome-to-fate.html");
        assert_eq!(post.route, "/posts/welcome-to-fate/");
    }

    #[test]
    fn route_collisions_report_both_ids_and_leave_the_route_ambiguous() {
        let (model, diagnostics) = SiteModel::build(
            &graph(vec![
                plain("posts/hello.md"),
                plain("posts/2025-06-15-hello.md"),
            ]),
            false,
            "en",
        );
        assert_eq!(diagnostics.len(), 1, "{diagnostics:?}");
        let conflict = &diagnostics[0];
        assert_eq!(conflict.code, ROUTE_CONFLICT_CODE);
        assert_eq!(conflict.severity, Severity::Error);
        assert!(conflict.message.contains("posts/hello.md"));
        assert!(conflict.message.contains("posts/2025-06-15-hello.md"));
        assert!(conflict.message.contains("/posts/hello/"));
        assert!(model.route_target("/posts/hello/").is_none());
        assert!(model.page("posts/hello.md").is_some());
        assert!(model.page("posts/2025-06-15-hello.md").is_some());
        assert!(model.route_target("/index/").is_none());
    }

    #[test]
    fn pages_are_in_content_id_order() {
        let model = model(vec![
            plain("posts/b.md"),
            plain("index.md"),
            plain("about.md"),
        ]);
        let ids: Vec<&str> = model.pages().iter().map(|p| p.id.0.as_str()).collect();
        assert_eq!(ids, ["about.md", "index.md", "posts/b.md"]);
    }

    #[test]
    fn posts_sort_by_date_desc_then_route_and_skip_drafts_in_production() {
        let nodes = vec![
            post("posts/2025-06-15-earlier.md", "2025-06-15", false),
            post("posts/2025-10-20-later.md", "2025-10-20", false),
            post("posts/2025-10-20-alpha.md", "2025-10-20", false),
            post("posts/2025-10-20-beta.md", "2025-10-20", false),
            post("posts/2025-12-01-draft.md", "2025-12-01", true),
            plain("about.md"),
            typed("index.md", "home"),
        ];
        let model = model(nodes);
        let published: Vec<&str> = model
            .posts(false)
            .iter()
            .map(|p| p.route.as_str())
            .collect();
        assert_eq!(
            published,
            [
                "/posts/alpha/",
                "/posts/beta/",
                "/posts/later/",
                "/posts/earlier/",
            ]
        );
        let with_drafts: Vec<&str> = model.posts(true).iter().map(|p| p.route.as_str()).collect();
        assert_eq!(published.len(), 4);
        assert_eq!(
            with_drafts,
            [
                "/posts/draft/",
                "/posts/alpha/",
                "/posts/beta/",
                "/posts/later/",
                "/posts/earlier/",
            ]
        );
    }

    #[test]
    fn resolve_link_maps_routes_to_output_urls() {
        let model = model(vec![
            plain("index.md"),
            plain("about.md"),
            plain("gallery.md"),
            plain("posts/2025-06-15-welcome-to-fate.md"),
            plain("posts/2025-10-20-building-a-theme.md"),
        ]);
        assert_eq!(
            model
                .resolve_link("posts/welcome-to-fate/", "index.md")
                .as_deref(),
            Some("/pages/posts/2025-06-15-welcome-to-fate.html")
        );
        assert_eq!(
            model.resolve_link("about/", "index.md").as_deref(),
            Some("/pages/about.html")
        );
        assert_eq!(
            model
                .resolve_link("/gallery/", "posts/2025-06-15-welcome-to-fate.md")
                .as_deref(),
            Some("/pages/gallery.html")
        );
        assert_eq!(
            model.resolve_link("/", "tags.md").as_deref(),
            Some("/pages/index.html")
        );
        assert_eq!(
            model
                .resolve_link("../about/", "posts/2025-06-15-welcome-to-fate.md")
                .as_deref(),
            Some("/pages/about.html")
        );
        assert_eq!(
            model
                .resolve_link("./building-a-theme/", "posts/2025-06-15-welcome-to-fate.md")
                .as_deref(),
            Some("/pages/posts/2025-10-20-building-a-theme.html")
        );
        assert_eq!(
            model
                .resolve_link("posts/welcome-to-fate", "index.md")
                .as_deref(),
            Some("/pages/posts/2025-06-15-welcome-to-fate.html")
        );
    }

    #[test]
    fn site_pages_carry_raw_tags_and_default_to_empty_sequence() {
        let model = model(vec![
            node(
                "posts/a.md",
                FrontMatter {
                    tags: vec!["Meta".into(), "技术".into()],
                    ..FrontMatter::default()
                },
            ),
            plain("about.md"),
        ]);
        assert_eq!(
            model.page("posts/a.md").unwrap().tags,
            ["Meta", "技术"],
            "SitePage keeps the raw front matter sequence"
        );
        assert!(model.page("about.md").unwrap().tags.is_empty());
        let wire = serde_json::to_value(model.page("about.md").unwrap()).unwrap();
        assert_eq!(wire["tags"], serde_json::json!([]));
    }

    #[test]
    fn resolve_link_keeps_external_fragments_and_unknown_hrefs() {
        let model = model(vec![plain("index.md"), plain("about.md")]);
        for href in [
            "https://example.com/posts/welcome-to-fate/",
            "http://example.com/",
            "mailto:hi@example.com",
            "//cdn.example.com/x/",
            "#section",
            "?q=1",
            "posts/unknown-post/",
            "assets/logo.png",
            "",
        ] {
            assert_eq!(
                model.resolve_link(href, "index.md"),
                None,
                "`{href}` must stay verbatim"
            );
        }
        assert_eq!(
            model.resolve_link("about/#team", "index.md").as_deref(),
            Some("/pages/about.html#team")
        );
        assert_eq!(
            model.resolve_link("/gallery/?size=lg", "index.md"),
            None,
            "unknown routes keep their query suffix untouched"
        );
    }

    #[test]
    fn conflicted_routes_do_not_resolve_links() {
        let model = model(vec![
            plain("index.md"),
            plain("posts/hello.md"),
            plain("posts/2025-06-15-hello.md"),
        ]);
        assert_eq!(model.resolve_link("posts/hello/", "index.md"), None);
    }

    #[test]
    fn slug_normalization_trims_lowercases_and_collapses_whitespace() {
        assert_eq!(normalize_tag_slug("  Hello   World  "), "hello-world");
        assert_eq!(normalize_tag_slug("Meta"), "meta");
        assert_eq!(normalize_tag_slug("技术"), "技术");
        assert_eq!(normalize_tag_slug("A\tB\nC"), "a-b-c");
        assert_eq!(normalize_tag_slug("   "), "");
    }

    #[test]
    fn tag_aggregates_are_derived_and_registered_in_the_same_route_table() {
        let (model, diagnostics) = SiteModel::build(
            &graph(vec![
                tagged_post(
                    "posts/2025-06-15-a.md",
                    "2025-06-15",
                    &["技术", "Meta"],
                    false,
                ),
                tagged_post("posts/2025-10-20-b.md", "2025-10-20", &["技术"], false),
                node(
                    "about.md",
                    FrontMatter {
                        tags: vec!["meta".into()],
                        ..FrontMatter::default()
                    },
                ),
            ]),
            false,
            "en",
        );
        assert!(diagnostics.is_empty(), "{diagnostics:?}");

        let index = model
            .route_target("/tags/")
            .expect("index route registered");
        assert_eq!(index.id.0, TAGS_INDEX_ID);
        assert_eq!(index.output, "pages/tags.html");
        assert_eq!(index.url, "/pages/tags.html");
        assert_eq!(index.page_type, PageType::Page);
        assert!(!index.draft);

        let TaxonomyView::TagIndex(entries) = model.taxonomy(&index.id).unwrap() else {
            panic!("index view must be a tag index")
        };
        assert_eq!(
            entries
                .iter()
                .map(|e| (e.tag.as_str(), e.display.as_str(), e.count))
                .collect::<Vec<_>>(),
            [("技术", "技术", 2), ("meta", "Meta", 1)],
            "count desc then slug asc, non-post tags never join"
        );
        assert_eq!(entries[0].url, "/pages/tags/技术.html");

        let tag = model
            .route_target("/tags/meta/")
            .expect("tag route registered");
        assert_eq!(tag.id.0, "taxonomy:tag/meta");
        assert_eq!(tag.output, "pages/tags/meta.html");
        assert_eq!(tag.url, "/pages/tags/meta.html");
        assert_eq!(tag.title.as_deref(), Some("Meta"));

        assert_eq!(
            model.resolve_link("tags/", "about.md").as_deref(),
            Some("/pages/tags.html")
        );
        assert_eq!(
            model.resolve_link("tags/meta/", "about.md").as_deref(),
            Some("/pages/tags/meta.html")
        );

        let view = model
            .taxonomy(&ContentId("taxonomy:tag/技术".into()))
            .unwrap();
        let TaxonomyView::Tag { posts, .. } = view else {
            panic!("tag view must carry members")
        };
        assert_eq!(
            posts.iter().map(|id| id.0.as_str()).collect::<Vec<_>>(),
            ["posts/2025-10-20-b.md", "posts/2025-06-15-a.md"],
            "members keep site.posts order"
        );

        let ids: Vec<&str> = model.pages().iter().map(|p| p.id.0.as_str()).collect();
        assert_eq!(
            ids,
            [
                "about.md",
                "posts/2025-06-15-a.md",
                "posts/2025-10-20-b.md",
                TAGS_INDEX_ID,
                "taxonomy:tag/meta",
                "taxonomy:tag/技术",
            ],
            "content pages first, then the index and tag pages by slug"
        );
        assert_eq!(model.content_pages().len(), 3);
    }

    #[test]
    fn slug_variants_merge_and_the_first_raw_tag_wins_display() {
        let (model, diagnostics) = SiteModel::build(
            &graph(vec![
                tagged_post(
                    "posts/2025-06-15-a.md",
                    "2025-06-15",
                    &["  Meta   Tag ", "meta tag"],
                    false,
                ),
                tagged_post("posts/2025-10-20-b.md", "2025-10-20", &["META TAG"], false),
            ]),
            false,
            "en",
        );
        assert!(diagnostics.is_empty(), "{diagnostics:?}");
        assert_eq!(
            model.pages().len(),
            4,
            "two content pages plus one index and one merged tag page"
        );
        let TaxonomyView::TagIndex(entries) =
            model.taxonomy(&ContentId(TAGS_INDEX_ID.into())).unwrap()
        else {
            panic!("index view")
        };
        assert_eq!(entries.len(), 1, "all variants normalize to one slug");
        assert_eq!(entries[0].tag, "meta-tag");
        assert_eq!(
            entries[0].display, "  Meta   Tag ",
            "display is the first raw tag in content-id order"
        );
        assert_eq!(entries[0].count, 2, "one post counts once per slug");
    }

    #[test]
    fn content_wins_taxonomy_routes_and_skips_aggregates_with_warnings() {
        let (model, diagnostics) = SiteModel::build(
            &graph(vec![
                plain("tags.md"),
                plain("tags/meta.md"),
                tagged_post("posts/2025-06-15-a.md", "2025-06-15", &["Meta"], false),
            ]),
            false,
            "en",
        );
        assert!(
            model.pages().iter().all(|p| p.id.0 != TAGS_INDEX_ID),
            "the index aggregate must be skipped"
        );
        assert!(
            model.pages().iter().all(|p| p.id.0 != "taxonomy:tag/meta"),
            "the tag aggregate must be skipped"
        );
        assert_eq!(model.route_target("/tags/").unwrap().id.0, "tags.md");
        assert_eq!(
            model.route_target("/tags/meta/").unwrap().id.0,
            "tags/meta.md"
        );

        let conflicts: Vec<&Diagnostic> = diagnostics
            .iter()
            .filter(|d| d.code == TAXONOMY_CONFLICT_CODE)
            .collect();
        assert_eq!(conflicts.len(), 2, "{diagnostics:?}");
        assert!(conflicts
            .iter()
            .all(|d| d.severity == Severity::Warning && d.file.is_some()));
        assert!(conflicts
            .iter()
            .any(|d| { d.message.contains("tags.md") && d.message.contains("`/tags/`") }));
        assert!(conflicts.iter().any(|d| {
            d.message.contains("tags/meta.md") && d.message.contains("`/tags/meta/`")
        }));
    }

    #[test]
    fn drafts_join_aggregates_only_when_the_mode_includes_them() {
        let nodes = vec![
            tagged_post("posts/2025-06-15-a.md", "2025-06-15", &["meta"], false),
            tagged_post(
                "posts/2025-07-01-d.md",
                "2025-07-01",
                &["draft-only", "meta"],
                true,
            ),
        ];

        let (prod, diagnostics) = SiteModel::build(&graph(nodes.clone()), false, "en");
        assert!(diagnostics.is_empty(), "{diagnostics:?}");
        let TaxonomyView::TagIndex(entries) =
            prod.taxonomy(&ContentId(TAGS_INDEX_ID.into())).unwrap()
        else {
            panic!("index view")
        };
        assert_eq!(
            entries
                .iter()
                .map(|e| (e.tag.as_str(), e.count))
                .collect::<Vec<_>>(),
            [("meta", 1)],
            "production aggregates exclude drafts"
        );
        assert!(
            prod.pages()
                .iter()
                .all(|p| p.id.0 != "taxonomy:tag/draft-only"),
            "a draft-only tag has no production page"
        );

        let (dev, diagnostics) = SiteModel::build(&graph(nodes), true, "en");
        assert!(diagnostics.is_empty(), "{diagnostics:?}");
        let TaxonomyView::TagIndex(entries) =
            dev.taxonomy(&ContentId(TAGS_INDEX_ID.into())).unwrap()
        else {
            panic!("index view")
        };
        assert_eq!(
            entries
                .iter()
                .map(|e| (e.tag.as_str(), e.count))
                .collect::<Vec<_>>(),
            [("meta", 2), ("draft-only", 1)],
            "development aggregates include drafts"
        );
        let TaxonomyView::Tag { posts, .. } = dev
            .taxonomy(&ContentId("taxonomy:tag/meta".into()))
            .unwrap()
        else {
            panic!("tag view")
        };
        assert_eq!(posts.len(), 2);
    }

    fn localized(rel: &str, lang: &str) -> ContentNode {
        node(
            rel,
            FrontMatter {
                lang: Some(lang.into()),
                ..FrontMatter::default()
            },
        )
    }

    #[test]
    fn non_default_locales_prefix_the_route_and_default_stays_unprefixed() {
        let (model, diagnostics) = SiteModel::build(
            &graph(vec![
                plain("index.md"),
                localized("blog/index.md", "zh-CN"),
                localized("about.md", "zh-CN"),
                plain("about.en.md"),
            ]),
            false,
            "en",
        );
        assert!(diagnostics.is_empty(), "{diagnostics:?}");
        assert_eq!(model.page("index.md").unwrap().route, "/");
        assert_eq!(model.page("index.md").unwrap().locale, "en");
        assert_eq!(model.page("blog/index.md").unwrap().route, "/zh-CN/blog/");
        assert_eq!(model.page("blog/index.md").unwrap().locale, "zh-CN");
        assert_eq!(model.page("about.md").unwrap().route, "/zh-CN/about/");
        assert_eq!(model.page("about.en.md").unwrap().route, "/about.en/");
        assert_eq!(model.page("about.en.md").unwrap().locale, "en");

        let zh_blog = model.route_target("/zh-CN/blog/").expect("prefixed index route");
        assert_eq!(zh_blog.id.0, "blog/index.md");
        let zh_about = model.route_target("/zh-CN/about/").expect("prefixed about route");
        assert_eq!(zh_about.id.0, "about.md");
        assert!(model.route_target("/about/").is_none());

        assert_eq!(
            model.resolve_link("zh-CN/about/", "index.md").as_deref(),
            Some("/pages/about.html"),
            "locale-prefixed routes resolve like any authored route"
        );
        assert_eq!(
            model.page("blog/index.md").unwrap().output, "pages/blog/index.html",
            "output and url keep following the content path"
        );
    }

    #[test]
    fn prefixed_locale_routes_conflict_like_any_other_routes() {
        let (model, diagnostics) = SiteModel::build(
            &graph(vec![
                plain("zh-CN/about.md"),
                localized("about.md", "zh-CN"),
            ]),
            false,
            "en",
        );
        assert_eq!(diagnostics.len(), 1, "{diagnostics:?}");
        let conflict = &diagnostics[0];
        assert_eq!(conflict.code, ROUTE_CONFLICT_CODE);
        assert_eq!(conflict.severity, Severity::Error);
        assert!(conflict.message.contains("/zh-CN/about/"));
        assert!(model.route_target("/zh-CN/about/").is_none());
        assert!(model.page("about.md").is_some());
        assert!(model.page("zh-CN/about.md").is_some());
    }

    #[test]
    fn invalid_front_matter_lang_falls_back_to_the_default_locale() {
        let (model, diagnostics) = SiteModel::build(
            &graph(vec![
                localized("bad.md", "a/b"),
                localized("empty.md", "   "),
                localized("good.md", " zh-CN "),
            ]),
            false,
            "en",
        );
        assert_eq!(diagnostics.len(), 1, "{diagnostics:?}");
        assert_eq!(diagnostics[0].code, INVALID_LOCALE_CODE);
        assert_eq!(diagnostics[0].severity, Severity::Warning);
        assert!(diagnostics[0].message.contains("a/b"));
        assert_eq!(diagnostics[0].file.as_deref(), Some("bad.md"));
        assert_eq!(model.page("bad.md").unwrap().locale, "en");
        assert_eq!(model.page("bad.md").unwrap().route, "/bad/");
        assert_eq!(model.page("empty.md").unwrap().locale, "en");
        assert_eq!(model.page("good.md").unwrap().locale, "zh-CN");
        assert_eq!(model.page("good.md").unwrap().route, "/zh-CN/good/");
    }

    #[test]
    fn taxonomy_pages_carry_the_default_locale_and_stay_unprefixed() {
        let (model, diagnostics) = SiteModel::build(
            &graph(vec![
                localized("posts/2025-06-15-a.md", "zh-CN"),
                node(
                    "posts/2025-10-20-b.md",
                    FrontMatter {
                        date: Some("2025-10-20".into()),
                        tags: vec!["Meta".into()],
                        ..FrontMatter::default()
                    },
                ),
            ]),
            false,
            "en",
        );
        assert!(diagnostics.is_empty(), "{diagnostics:?}");
        let index = model.route_target("/tags/").expect("index route stays unprefixed");
        assert_eq!(index.locale, "en");
        let tag = model.route_target("/tags/meta/").expect("tag route stays unprefixed");
        assert_eq!(tag.locale, "en");
        assert_eq!(model.page("posts/2025-06-15-a.md").unwrap().route, "/zh-CN/posts/a/");
    }

    #[test]
    fn site_page_wire_serializes_the_locale_field() {
        let model = model(vec![localized("about.md", "zh-CN")]);
        let wire = serde_json::to_value(model.page("about.md").unwrap()).unwrap();
        assert_eq!(wire["locale"], serde_json::json!("zh-CN"));
    }

    #[test]
    fn sites_without_tagged_posts_get_no_taxonomy_pages() {
        let (model, diagnostics) = SiteModel::build(
            &graph(vec![
                plain("index.md"),
                plain("about.md"),
                plain("posts/2025-06-15-untagged.md"),
            ]),
            false,
            "en",
        );
        assert!(diagnostics.is_empty(), "{diagnostics:?}");
        assert_eq!(model.pages().len(), 3);
        assert_eq!(model.content_pages().len(), 3);
        assert!(model.route_target("/tags/").is_none());
    }
}
