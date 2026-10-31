//! Content permalink plan: routes authored corpus-style links to built page URLs.
//!
//! The engine emits every Markdown page under `pages/<rel>.html` (see
//! [`crate::graph::staging_page_rel`]), while authored bodies link with
//! directory-style routes (`posts/<slug>/`, `about/`, `/gallery/`, `/`).
//! This plan indexes every content node by its route key so Markdown lowering
//! can rewrite `Inline::Link` destinations to the real output URL.
//!
//! Route keys strip the leading `YYYY-MM-DD-` date prefix from post filenames
//! and let `index` files own their directory. External destinations
//! (`http(s):`, `mailto:`, protocol-relative `//…`), pure fragments and hrefs
//! that match no content node are left untouched by [`PermalinkPlan::resolve`].

use std::collections::BTreeMap;

use crate::graph::{staging_page_rel, ContentGraph};

/// Immutable route → permalink index built from the full content graph once
/// per render pass.
#[derive(Debug, Clone, Default)]
pub struct PermalinkPlan {
    /// Route key (`/`, `/about/`, `/posts/<slug>/`) → permalink URL.
    routes: BTreeMap<String, String>,
    /// Content rel path → permalink URL.
    permalinks: BTreeMap<String, String>,
}

impl PermalinkPlan {
    /// Index every node of `graph`. On a route-key collision the first node in
    /// content-id order wins and the other node keeps its own permalink entry.
    pub fn build(graph: &ContentGraph) -> Self {
        let mut plan = Self::default();
        for node in graph.nodes.values() {
            let permalink = format!("/{}", staging_page_rel(node));
            plan.permalinks.insert(node.rel_path.clone(), permalink.clone());
            plan.routes
                .entry(route_key(&node.rel_path))
                .or_insert(permalink);
        }
        plan
    }

    /// Output permalink URL of a content rel path, when the node is indexed.
    pub fn permalink_for(&self, rel: &str) -> Option<&str> {
        self.permalinks.get(rel).map(String::as_str)
    }

    /// Resolve one authored link destination against the current node's
    /// location. `Some(url)` replaces the destination, `None` keeps it verbatim.
    pub fn resolve(&self, href: &str, from_rel: &str) -> Option<String> {
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
        let permalink = self.routes.get(&key)?;
        Some(format!("{permalink}{suffix}"))
    }
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

/// Route key of a content rel path: `/[<dir>/]<slug>/` with the date prefix
/// stripped; `index` files own their directory (`index.md` → `/`).
fn route_key(rel: &str) -> String {
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
    use crate::graph::{ContentId, ContentKind, ContentNode};
    use std::path::PathBuf;

    fn node(rel: &str) -> ContentNode {
        ContentNode {
            id: ContentId(rel.into()),
            path: PathBuf::from(rel),
            rel_path: rel.into(),
            kind: ContentKind::Markdown,
            front_matter: Default::default(),
            body: String::new(),
            content_hash: "x".into(),
        }
    }

    fn plan() -> PermalinkPlan {
        let mut graph = ContentGraph::default();
        graph.insert(node("index.md"));
        graph.insert(node("about.md"));
        graph.insert(node("gallery.md"));
        graph.insert(node("posts/2025-06-15-welcome-to-fate.md"));
        graph.insert(node("posts/2025-10-20-building-a-theme.md"));
        PermalinkPlan::build(&graph)
    }

    #[test]
    fn route_keys_strip_dates_and_index_owns_directory() {
        assert_eq!(route_key("index.md"), "/");
        assert_eq!(route_key("posts/2025-06-15-welcome-to-fate.md"), "/posts/welcome-to-fate/");
        assert_eq!(route_key("blog/index.md"), "/blog/");
        assert_eq!(route_key("notes/plain.MD"), "/notes/plain/");
        assert_eq!(strip_date_prefix("2025-06-15"), "2025-06-15");
    }

    #[test]
    fn resolves_corpus_relative_and_absolute_routes() {
        let plan = plan();
        assert_eq!(
            plan.resolve("posts/welcome-to-fate/", "index.md").as_deref(),
            Some("/pages/posts/2025-06-15-welcome-to-fate.html")
        );
        assert_eq!(plan.resolve("about/", "index.md").as_deref(), Some("/pages/about.html"));
        assert_eq!(plan.resolve("/gallery/", "posts/2025-06-15-welcome-to-fate.md").as_deref(), Some("/pages/gallery.html"));
        assert_eq!(plan.resolve("/", "tags.md").as_deref(), Some("/pages/index.html"));
        assert_eq!(
            plan.resolve("../about/", "posts/2025-06-15-welcome-to-fate.md").as_deref(),
            Some("/pages/about.html")
        );
        assert_eq!(
            plan.resolve("./building-a-theme/", "posts/2025-06-15-welcome-to-fate.md").as_deref(),
            Some("/pages/posts/2025-10-20-building-a-theme.html")
        );
        assert_eq!(
            plan.resolve("posts/welcome-to-fate", "index.md").as_deref(),
            Some("/pages/posts/2025-06-15-welcome-to-fate.html")
        );
    }

    #[test]
    fn keeps_external_fragments_and_unknown_hrefs() {
        let plan = plan();
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
            assert_eq!(plan.resolve(href, "index.md"), None, "`{href}` must stay verbatim");
        }
    }

    #[test]
    fn preserves_fragment_and_query_suffixes() {
        let plan = plan();
        assert_eq!(
            plan.resolve("about/#team", "index.md").as_deref(),
            Some("/pages/about.html#team")
        );
        assert_eq!(
            plan.resolve("/gallery/?size=lg", "index.md").as_deref(),
            Some("/pages/gallery.html?size=lg")
        );
    }

    #[test]
    fn permalink_for_indexes_node_rel_paths() {
        let plan = plan();
        assert_eq!(
            plan.permalink_for("posts/2025-06-15-welcome-to-fate.md"),
            Some("/pages/posts/2025-06-15-welcome-to-fate.html")
        );
        assert_eq!(plan.permalink_for("missing.md"), None);
    }
}
