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

/// Stable diagnostic code for two contents mapping to one route.
pub const ROUTE_CONFLICT_CODE: &str = "doki.site.route-conflict";
/// Stable diagnostic code for an unrecognized front matter `type`.
pub const INVALID_TYPE_CODE: &str = "doki.site.invalid-type";

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
}

/// Immutable site index built once per build from the full content graph.
#[derive(Debug, Clone)]
pub struct SiteModel {
    /// Every page in content-id order.
    pages: Vec<SitePage>,
    /// Content rel path → index into `pages`.
    by_rel: BTreeMap<String, usize>,
    /// Authored route → index into `pages` (conflicted routes are absent).
    by_route: BTreeMap<String, usize>,
}

impl SiteModel {
    /// Index every node of `graph` in content-id order.
    ///
    /// Invalid front matter `type` values and duplicate routes are reported as
    /// [`Diagnostic`]s; a conflicted route is left ambiguous instead of
    /// silently picking the first node.
    pub fn build(graph: &ContentGraph) -> (Self, Vec<Diagnostic>) {
        let mut diagnostics = Vec::new();
        let mut pages: Vec<SitePage> = Vec::with_capacity(graph.len());
        let mut by_rel = BTreeMap::new();
        let mut by_route = BTreeMap::new();
        let mut conflicted = BTreeSet::new();

        for node in graph.nodes.values() {
            let page_type = derive_page_type(node, &mut diagnostics);
            let route = route_of(&node.rel_path);
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
            });
        }

        (
            Self {
                pages,
                by_rel,
                by_route,
            },
            diagnostics,
        )
    }

    /// Every page in content-id order.
    pub fn pages(&self) -> &[SitePage] {
        &self.pages
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
        SiteModel::build(&graph(nodes)).0
    }

    #[test]
    fn type_derivation_follows_precedence() {
        let (model, diagnostics) = SiteModel::build(&graph(vec![
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
        ]));
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
        let (model, diagnostics) = SiteModel::build(&graph(vec![
            typed("about.md", "article"),
            typed("posts/a.md", "blog"),
        ]));
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
        let (model, diagnostics) = SiteModel::build(&graph(vec![
            plain("posts/hello.md"),
            plain("posts/2025-06-15-hello.md"),
        ]));
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
}
