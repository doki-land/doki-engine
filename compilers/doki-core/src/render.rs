//! Page render: Markdown → HTML, then Dejavu **public** facade for layouts.
//!
//! Depends only on the `dejavu` crate (not dejavu-language / dejavu-ir / dejavu-engine).
//! Layouts use the Dejavu default language (`<% %>` code, `<# #>` comments), so Doki does
//! not carry a private delimiter config that could drift from the upstream default.

use std::path::{Path, PathBuf};

use dejavu::Dejavu;
use notedown_formats::export::html::export_html;
use notedown_formats::import::markdown::import_markdown_bytes;
use pulldown_cmark::{html, Options, Parser};
use serde_json::{json, Value};

use crate::config::{ExtensionRef, ProjectConfig};
use crate::error::{CoreError, CoreResult};
use crate::graph::ContentNode;

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
pub fn render_page(
    project_root: &Path,
    config: &ProjectConfig,
    theme_root: Option<&Path>,
    node: &ContentNode,
) -> CoreResult<RenderedPage> {
    let content_html = markdown_to_html(&node.body);
    let layout_name = node
        .front_matter
        .layout
        .as_deref()
        .unwrap_or("layout");
    let (layout_source, layout_id) =
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
        // Default layouts read `page.lang`; front matter may override per page.
        if !map.contains_key("lang") {
            map.insert("lang".into(), Value::String(config.lang.clone()));
        }
    }

    let ctx = json!({
        "site": {
            "title": config.title,
            "description": config.description,
            "baseUrl": config.base_url,
            "lang": config.lang,
            "author": config.author,
        },
        "page": page_fields,
        "title": title,
        "content": content_html,
    });

    let html = Dejavu::render_source(&layout_source, &ctx).map_err(|e| {
        CoreError::build(format!(
            "doki render failed for `{}` (layout {layout_id}): {e}",
            node.rel_path
        ))
    })?;

    Ok(RenderedPage { html, layout_id })
}

pub fn markdown_to_html(markdown: &str) -> String {
    match import_markdown_bytes("inline", markdown) {
        Ok(graph) => export_html(&graph).unwrap_or_else(|_| pulldown_fallback(markdown)),
        Err(_) => pulldown_fallback(markdown),
    }
}

/// Temporary fallback while Notedown lowering catches up on task lists and raw HTML.
fn pulldown_fallback(markdown: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    let parser = Parser::new_ext(markdown, options);
    let mut out = String::new();
    html::push_html(&mut out, parser);
    out
}

fn resolve_layout(
    project_root: &Path,
    theme: Option<&ExtensionRef>,
    theme_root: Option<&Path>,
    layout_name: &str,
) -> CoreResult<(String, String)> {
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
                return Ok((source, rel));
            }
        }
    }
    Ok((DEFAULT_LAYOUT.to_string(), format!("builtin:{layout_name}")))
}

fn layout_candidates(theme_root: &Path, layout_name: &str) -> Vec<PathBuf> {
    let layouts = theme_root.join("layouts");
    vec![
        layouts.join(format!("{layout_name}.dejavu")),
        layouts.join(format!("{layout_name}.dj")),
        layouts.join(format!("{layout_name}.html")),
        theme_root.join(format!("layouts/{layout_name}.dejavu")),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ProjectConfig;
    use crate::frontmatter::parse_document;
    use crate::graph::{ContentId, ContentKind, ContentNode, FrontMatterDto};

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
        let page = render_page(dir.path(), &cfg, None, &node).unwrap();
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
        let page = render_page(dir.path(), &cfg, None, &node).unwrap();
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
        let page = render_page(dir.path(), &cfg, None, &node).unwrap();
        assert!(page.html.contains("<wrap>T:"));
        assert!(
            page.html.contains("<em>x</em>"),
            "expected raw emphasis HTML via `|> safe`, got: {}",
            page.html
        );
        assert!(page.layout_id.contains("themes/docs/layouts/layout.dejavu"));
    }
}
