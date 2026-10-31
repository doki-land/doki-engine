//! Page render: Markdown → HTML, then Dejavu **public** facade for layouts.
//!
//! Depends only on the `dejavu` crate (not dejavu-language / dejavu-ir / dejavu-engine).
//! Layout delimiters are chosen by file extension:
//!
//! - `.doki` / `.dj` → `{% ... %}` code, `{# ... #}` comments
//! - `.dejavu` / `.html` (legacy) → default `<% ... %>` code, `<# ... #>` comments
//! - extensionless sources (builtin fallback) → default `<% ... %>` profile
//!
//! Dejavu IR has **no** `output_start` / `output_end` — a single slot is classified as
//! statement or expression by keyword.  There is no `{{ expr }}` or `<%= expr %>`.

use std::path::{Path, PathBuf};

use dejavu::{Dejavu, Language, TemplateConfig};
use notedown_formats::export::html::export_html;
use notedown_formats::import::markdown::import_markdown_bytes;
use notedown_ir::{Block, DocumentGraph, Inline, RelationEndpoint};
use serde_json::{json, Value};

use crate::config::{ExtensionRef, ProjectConfig};
use crate::error::{CoreError, CoreResult};
use crate::graph::ContentNode;
use crate::site::SiteModel;

/// Built-in layout when no theme file is found (Dejavu default `<% %>` delimiters).
///
/// `content` is Markdown HTML produced by Doki itself, i.e. trusted host content, so
/// `|> safe` emits it verbatim instead of escaping it.
pub const DEFAULT_LAYOUT: &str = r#"<!DOCTYPE html>
<html lang="<% page.lang %>">
<head>
<meta charset="utf-8"/>
<title><% page.title %></title>
</head>
<body>
<main>
<% content |> safe %>
</main>
</body>
</html>
"#;

/// Default Dejavu T1 language config (`<% %>` code, `<# #>` comments).
fn default_dejavu_language() -> Language {
    Language {
        syntax_mode: "template".into(),
        template: TemplateConfig {
            code_start: "<%".into(),
            code_end: "%>".into(),
            comment_start: "<#".into(),
            comment_end: "#>".into(),
            support_filter_pipe: true,
            legacy_for: false,
        },
    }
}

/// Resolve a [`Language`] config from a layout file extension.
///
/// - `"doki"` / `"dj"` → Doki-native `{% %}` code, `{# #}` comments, filter pipe on.
/// - everything else (including `"dejavu"`, `"html"`, `None`) → Dejavu default `<% %>`.
pub fn language_for_ext(ext: Option<&str>) -> Language {
    match ext {
        Some("doki") | Some("dj") => Language {
            syntax_mode: "template".into(),
            template: TemplateConfig {
                code_start: "{%".into(),
                code_end: "%}".into(),
                comment_start: "{#".into(),
                comment_end: "#}".into(),
                support_filter_pipe: true,
                legacy_for: false,
            },
        },
        _ => default_dejavu_language(),
    }
}

#[derive(Debug, Clone)]
pub struct RenderedPage {
    pub html: String,
    /// Layout identity for dependency edges (`builtin:layout` or relative theme path).
    pub layout_id: String,
}

/// Render one content node through Markdown + Dejavu layout.
///
/// `theme_root` is the absolute theme directory after Node resolution (`path` or package root).
/// When `None`, falls back to `config.theme.path` relative to `project_root`, else builtin.
///
/// `site` rewrites corpus-style Markdown link destinations to built page URLs
/// and exposes `page.type` / `page.route` / `page.url` / `page.permalink` plus
/// `site.posts` to the layout. `include_drafts` selects the collection mode so
/// development builds see drafts while production builds do not.
///
/// Language config is selected from the layout file's extension via [`language_for_ext`],
/// so `.doki` and `.dejavu` themes can ship side-by-side with their native delimiters.
pub fn render_page(
    project_root: &Path,
    config: &ProjectConfig,
    theme_root: Option<&Path>,
    node: &ContentNode,
    site: &SiteModel,
    include_drafts: bool,
) -> CoreResult<RenderedPage> {
    let page =
        site.page(&node.rel_path)
            .ok_or_else(|| CoreError::build(format!("no site page for `{}`", node.rel_path)))?;
    let content_html = markdown_to_html(&node.body, Some((site, node.rel_path.as_str())))?;
    let layout_name = node
        .front_matter
        .layout
        .as_deref()
        .unwrap_or("layout");
    let (layout_source, layout_id, layout_ext) =
        resolve_layout(project_root, config.theme.as_ref(), theme_root, layout_name)?;

    let title = node
        .front_matter
        .title
        .clone()
        .unwrap_or_else(|| config.title.clone());

    let mut page_fields = Value::Object(node.front_matter.fields.clone());
    if let Value::Object(map) = &mut page_fields {
        map.insert("title".into(), Value::String(title.clone()));
        if let Some(d) = &node.front_matter.description {
            map.insert("description".into(), Value::String(d.clone()));
        }
        if let Some(layout) = &node.front_matter.layout {
            map.insert("layout".into(), Value::String(layout.clone()));
        }
        map.insert("draft".into(), Value::Bool(node.front_matter.draft));
        map.insert("relPath".into(), Value::String(node.rel_path.clone()));
        map.insert(
            "type".into(),
            serde_json::to_value(page.page_type).expect("page type serializes"),
        );
        map.insert("route".into(), Value::String(page.route.clone()));
        map.insert("url".into(), Value::String(page.url.clone()));
        map.insert("permalink".into(), Value::String(page.url.clone()));
        // Default layouts read `page.lang`; front matter may override per page.
        if !map.contains_key("lang") {
            map.insert("lang".into(), Value::String(config.lang.clone()));
        }
    }

    let posts: Vec<Value> = site
        .posts(include_drafts)
        .into_iter()
        .map(|post| {
            json!({
                "title": post.title,
                "url": post.url,
                "date": post.date,
                "description": post.description,
                "type": post.page_type,
            })
        })
        .collect();

    let ctx = json!({
        "site": {
            "title": config.title,
            "description": config.description,
            "baseUrl": config.base_url,
            "lang": config.lang,
            "author": config.author,
            "posts": posts,
        },
        "page": page_fields,
        "title": title,
        "content": content_html,
    });

    let language = language_for_ext(layout_ext.as_deref());
    let html = Dejavu::render_source_with(&layout_source, &ctx, &language).map_err(|e| {
        CoreError::build(format!(
            "doki render failed for `{}` (layout {layout_id}): {e}",
            node.rel_path
        ))
    })?;

    Ok(RenderedPage { html, layout_id })
}

/// Convert Markdown source to HTML via Notedown import + export pipeline.
///
/// Import or export failures are surfaced as structured [`CoreError`] variants
/// (`MarkdownImport` / `MarkdownExport`).  Errors are not silently swallowed; the
/// caller decides how to present the diagnostic.
///
/// When `site` is `Some((model, from_rel))`, authored `Inline::Link`
/// destinations that match a content route (`posts/<slug>/`, `about/`,
/// `/gallery/`, `/`) are rewritten to the built page URL before export;
/// external and unknown destinations stay verbatim.
///
/// Known upstream gaps tracked against Notedown revision `3c01bea`:
/// `Inline::Citation` and other semantic-only inline nodes still yield
/// `FormatError::Unsupported` from the conservative HTML exporter.  Task lists
/// and raw HTML (both block and inline) are wired since `6e899dd`.
pub fn markdown_to_html(markdown: &str, site: Option<(&SiteModel, &str)>) -> CoreResult<String> {
    let mut graph = import_markdown_bytes("inline", markdown)
        .map_err(|source| CoreError::MarkdownImport { source })?;
    if let Some((model, from_rel)) = site {
        rewrite_document_links(&mut graph, model, from_rel);
    }
    export_html(&graph).map_err(|source| CoreError::MarkdownExport { source })
}

/// Rewrite every `Inline::Link` destination in the imported graph through the
/// site model. Nested blocks live in the same `blocks` vec, so one flat
/// pass over all block nodes covers headings, paragraphs, lists, tables and
/// quotes at any nesting depth.
fn rewrite_document_links(graph: &mut DocumentGraph, model: &SiteModel, from_rel: &str) {
    for node in &mut graph.blocks {
        match &mut node.block {
            Block::Section { title, .. } => rewrite_inlines(title, model, from_rel),
            Block::Paragraph { content } | Block::Quote { content } => {
                rewrite_inlines(content, model, from_rel)
            }
            Block::List { items, .. } => {
                for item in items {
                    rewrite_inlines(&mut item.content, model, from_rel);
                }
            }
            Block::Table { rows, .. } => {
                for row in rows {
                    for cell in &mut row.cells {
                        rewrite_inlines(&mut cell.content, model, from_rel);
                    }
                }
            }
            _ => {}
        }
    }
}

fn rewrite_inlines(inlines: &mut [Inline], model: &SiteModel, from_rel: &str) {
    for inline in inlines.iter_mut() {
        match inline {
            Inline::Link { target, display, .. } => {
                if let RelationEndpoint::ExternalUri(uri) = target {
                    if let Some(rewritten) = model.resolve_link(uri, from_rel) {
                        *uri = rewritten;
                    }
                }
                rewrite_inlines(display, model, from_rel);
            }
            Inline::Styled { children, .. } | Inline::Attributed { children, .. } => {
                rewrite_inlines(children, model, from_rel)
            }
            Inline::Image { alt, .. } => rewrite_inlines(alt, model, from_rel),
            Inline::Note { display, .. } | Inline::Citation { display, .. } => {
                if let Some(display) = display {
                    rewrite_inlines(display, model, from_rel);
                }
            }
            _ => {}
        }
    }
}

fn resolve_layout(
    project_root: &Path,
    theme: Option<&ExtensionRef>,
    theme_root: Option<&Path>,
    layout_name: &str,
) -> CoreResult<(String, String, Option<String>)> {
    let resolved_root = theme_root
        .map(|p| p.to_path_buf())
        .or_else(|| {
            theme
                .and_then(|t| t.path.as_ref())
                .map(|path| project_root.join(path))
        });

    if let Some(theme_root) = resolved_root {
        for candidate in layout_candidates(&theme_root, layout_name) {
            if candidate.is_file() {
                let source = std::fs::read_to_string(&candidate)
                    .map_err(|source| CoreError::Io { source })?;
                let rel = candidate
                    .strip_prefix(project_root)
                    .unwrap_or(&candidate)
                    .to_string_lossy()
                    .replace('\\', "/");
                let ext = candidate
                    .extension()
                    .and_then(|s| s.to_str())
                    .map(|s| s.to_string());
                return Ok((source, rel, ext));
            }
        }
    }
    Ok((DEFAULT_LAYOUT.to_string(), format!("builtin:{layout_name}"), None))
}

fn layout_candidates(theme_root: &Path, layout_name: &str) -> Vec<PathBuf> {
    let layouts = theme_root.join("layouts");
    vec![
        layouts.join(format!("{layout_name}.doki")),
        layouts.join(format!("{layout_name}.dejavu")),
        layouts.join(format!("{layout_name}.dj")),
        layouts.join(format!("{layout_name}.html")),
        theme_root.join(format!("layouts/{layout_name}.doki")),
        theme_root.join(format!("layouts/{layout_name}.dejavu")),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ProjectConfig;
    use crate::frontmatter::parse_document;
    use crate::graph::{ContentGraph, ContentId, ContentKind, ContentNode, FrontMatterDto};

    fn node_from_md(rel: &str, source: &str) -> ContentNode {
        let doc = parse_document(source).unwrap();
        ContentNode {
            id: ContentId(rel.into()),
            path: PathBuf::from(rel),
            rel_path: rel.into(),
            kind: ContentKind::Markdown,
            front_matter: FrontMatterDto::from(doc.front_matter),
            body: doc.body,
            content_hash: "x".into(),
        }
    }

    fn site_of(nodes: &[ContentNode]) -> SiteModel {
        let mut graph = ContentGraph::default();
        for node in nodes {
            graph.insert(node.clone());
        }
        SiteModel::build(&graph).0
    }

    #[test]
    fn builtin_layout_renders_markdown_html() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = ProjectConfig {
            title: "Site".into(),
            ..ProjectConfig::default()
        };
        let node = node_from_md(
            "hello.md",
            "---\ntitle: Hello\n---\n\n# Heading\n\npara\n",
        );
        let site = site_of(&[node.clone()]);
        let page = render_page(dir.path(), &cfg, None, &node, &site, false).unwrap();
        assert!(page.html.contains("<title>Hello</title>"));
        assert!(
            page.html.contains(r#"<html lang="en">"#),
            "expected the site language to fill `page.lang`, got: {}",
            page.html
        );
        assert!(
            page.html.contains("<h1>Heading</h1>"),
            "expected raw heading HTML via `|> safe`, got: {}",
            page.html
        );
        assert!(page.layout_id.starts_with("builtin:"));
    }

    #[test]
    fn page_front_matter_lang_overrides_site_lang() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = ProjectConfig::default();
        let node = node_from_md("fr.md", "---\nlang: fr\n---\n\nbonjour\n");
        let site = site_of(&[node.clone()]);
        let page = render_page(dir.path(), &cfg, None, &node, &site, false).unwrap();
        assert!(
            page.html.contains(r#"<html lang="fr">"#),
            "expected front matter `lang` to win, got: {}",
            page.html
        );
    }

    #[test]
    fn path_theme_layout_wins() {
        let dir = tempfile::tempdir().unwrap();
        let layouts = dir.path().join("themes/docs/layouts");
        std::fs::create_dir_all(&layouts).unwrap();
        std::fs::write(
            layouts.join("layout.dejavu"),
            "<wrap><% title %>:<% content |> safe %></wrap>\n",
        )
        .unwrap();
        let cfg = ProjectConfig {
            title: "Site".into(),
            theme: Some(crate::config::ExtensionRef {
                path: Some("./themes/docs".into()),
                package: None,
            }),
            ..ProjectConfig::default()
        };
        let node = node_from_md("p.md", "---\ntitle: T\n---\n\n*x*\n");
        let site = site_of(&[node.clone()]);
        let page = render_page(dir.path(), &cfg, None, &node, &site, false).unwrap();
        assert!(page.html.contains("<wrap>T:"));
        assert!(
            page.html.contains("<em>x</em>"),
            "expected raw emphasis HTML via `|> safe`, got: {}",
            page.html
        );
        assert!(page.layout_id.contains("themes/docs/layouts/layout.dejavu"));
    }

    #[test]
    fn template_context_exposes_site_page_fields() {
        let dir = tempfile::tempdir().unwrap();
        let layouts = dir.path().join("themes/docs/layouts");
        std::fs::create_dir_all(&layouts).unwrap();
        std::fs::write(
            layouts.join("layout.doki"),
            "<ctx>{% page.type %}|{% page.route %}|{% page.url %}|{% page.permalink %}</ctx>\n",
        )
        .unwrap();
        let cfg = ProjectConfig {
            title: "Site".into(),
            theme: Some(crate::config::ExtensionRef {
                path: Some("./themes/docs".into()),
                package: None,
            }),
            ..ProjectConfig::default()
        };
        let node = node_from_md(
            "posts/2025-06-15-hello.md",
            "---\ntitle: Hi\n---\n\nx\n",
        );
        let site = site_of(&[node.clone()]);
        let page = render_page(dir.path(), &cfg, None, &node, &site, false).unwrap();
        assert!(
            page.html.contains(
                "<ctx>post|/posts/hello/|/pages/posts/2025-06-15-hello.html|/pages/posts/2025-06-15-hello.html</ctx>"
            ),
            "layout should read the site model page fields, got: {}",
            page.html
        );
    }
}
