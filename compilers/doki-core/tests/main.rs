//! Extension-profile and mixed `.doki` / `.dejavu` catalog regression gate for
//! doki-core render.
//!
//! Contract (per the Dejavu ecosystem gap analysis):
//! - `.doki` / `.dj` resolve to the `{% %}` profile **only**;
//! - `.dejavu`, `.html` (legacy) and extensionless sources resolve to the
//!   Dejavu default `<% %>` profile with no silent fallback;
//! - when both catalogs ship side by side, each layout file renders with its
//!   own extension-selected delimiters and failures name the layout.

use std::path::Path;

use doki_core::{
    language_for_ext, parse_document, render_page, ContentId, ContentKind, ContentNode,
    ExtensionRef, FrontMatterDto, ProjectConfig,
};

fn node_from_md(rel: &str, source: &str) -> ContentNode {
    let doc = parse_document(source).expect("front matter parses");
    ContentNode {
        id: ContentId(rel.into()),
        path: Path::new(rel).to_path_buf(),
        rel_path: rel.into(),
        kind: ContentKind::Markdown,
        front_matter: FrontMatterDto::from(doc.front_matter),
        body: doc.body,
        content_hash: "gate".into(),
    }
}

fn theme_cfg() -> ProjectConfig {
    ProjectConfig {
        title: "Site".into(),
        theme: Some(ExtensionRef {
            path: Some("./themes/docs".into()),
            package: None,
        }),
        ..ProjectConfig::default()
    }
}

fn write_layout(root: &Path, name: &str, source: &str) {
    let layouts = root.join("themes/docs/layouts");
    std::fs::create_dir_all(&layouts).expect("layouts dir");
    std::fs::write(layouts.join(name), source).expect("layout file");
}

#[test]
fn dj_and_doki_share_the_curly_profile_exclusively() {
    for ext in ["doki", "dj"] {
        let lang = language_for_ext(Some(ext));
        assert_eq!(lang.template.code_start, "{%", "`{ext}` profile");
        assert_eq!(lang.template.code_end, "%}", "`{ext}` profile");
        assert_eq!(lang.template.comment_start, "{#", "`{ext}` profile");
        assert_eq!(lang.template.comment_end, "#}", "`{ext}` profile");
    }
}

#[test]
fn dejavu_html_and_extensionless_sources_use_the_default_profile() {
    for ext in ["dejavu", "html", "htm", "txt", ""] {
        let lang = language_for_ext(Some(ext));
        assert_eq!(lang.template.code_start, "<%", "`{ext:?}` profile");
        assert_eq!(lang.template.code_end, "%>", "`{ext:?}` profile");
        assert_eq!(lang.template.comment_start, "<#", "`{ext:?}` profile");
        assert_eq!(lang.template.comment_end, "#>", "`{ext:?}` profile");
    }
    let lang = language_for_ext(None);
    assert_eq!(lang.template.code_start, "<%", "extensionless profile");
}

#[test]
fn dj_layout_renders_curly_delimiters_and_keeps_angle_brackets_literal() {
    let dir = tempfile::tempdir().unwrap();
    write_layout(
        dir.path(),
        "layout.dj",
        "<dj>{% title %}|<% literal %></dj>\n",
    );
    let node = node_from_md("p.md", "---\ntitle: T\n---\n\nbody\n");
    let page = render_page(dir.path(), &theme_cfg(), None, &node).unwrap();
    assert!(
        page.html.contains("<dj>T|<% literal %></dj>"),
        "expected curly delimiters parsed and `<% %>` literal, got: {}",
        page.html
    );
    assert!(
        page.layout_id.ends_with("layout.dj"),
        "expected `.dj` layout identity, got: {}",
        page.layout_id
    );
}

#[test]
fn html_layout_renders_default_delimiters_without_doki_fallback() {
    let dir = tempfile::tempdir().unwrap();
    write_layout(
        dir.path(),
        "layout.html",
        "<html-layout><% title %>|{% not-code %}</html-layout>\n",
    );
    let node = node_from_md("p.md", "---\ntitle: T\n---\n\nbody\n");
    let page = render_page(dir.path(), &theme_cfg(), None, &node).unwrap();
    assert!(
        page.html
            .contains("<html-layout>T|{% not-code %}</html-layout>"),
        "expected `<% %>` parsed and `{{% %}}` literal in `.html`, got: {}",
        page.html
    );
}

#[test]
fn extensionless_builtin_fallback_uses_the_default_profile() {
    let dir = tempfile::tempdir().unwrap();
    let cfg = ProjectConfig {
        title: "Site".into(),
        ..ProjectConfig::default()
    };
    let node = node_from_md("b.md", "---\ntitle: B\n---\n\nx\n");
    let page = render_page(dir.path(), &cfg, None, &node).unwrap();
    assert!(
        page.layout_id.starts_with("builtin:"),
        "expected builtin layout, got: {}",
        page.layout_id
    );
    assert!(
        page.html.contains("<title>B</title>"),
        "builtin `<% %>` layout should render the title, got: {}",
        page.html
    );
}

#[test]
fn mixed_catalog_prefers_doki_over_dejavu_and_dj_candidates() {
    let dir = tempfile::tempdir().unwrap();
    write_layout(dir.path(), "layout.dj", "<from-dj>{% title %}</from-dj>\n");
    write_layout(
        dir.path(),
        "layout.dejavu",
        "<from-dejavu><% title %></from-dejavu>\n",
    );
    write_layout(
        dir.path(),
        "layout.doki",
        "<from-doki>{% title %}</from-doki>\n",
    );
    let node = node_from_md("p.md", "---\ntitle: T\n---\n\nbody\n");
    let page = render_page(dir.path(), &theme_cfg(), None, &node).unwrap();
    assert!(
        page.html.contains("<from-doki>T</from-doki>"),
        "`.doki` should win the candidate order, got: {}",
        page.html
    );
    assert!(page.layout_id.ends_with("layout.doki"));
}

#[test]
fn side_by_side_catalogs_render_each_layout_with_its_own_profile() {
    let dir = tempfile::tempdir().unwrap();
    write_layout(dir.path(), "post.doki", "<p>{% title %}</p>\n");
    write_layout(dir.path(), "page.dejavu", "<q><% title %></q>\n");
    let cfg = theme_cfg();

    let post = node_from_md("a.md", "---\ntitle: A\nlayout: post\n---\n\nx\n");
    let rendered_post = render_page(dir.path(), &cfg, None, &post).unwrap();
    assert!(
        rendered_post.html.contains("<p>A</p>"),
        "`.doki` layout should parse `{{% %}}`, got: {}",
        rendered_post.html
    );
    assert!(rendered_post.layout_id.ends_with("post.doki"));

    let page = node_from_md("b.md", "---\ntitle: B\nlayout: page\n---\n\nx\n");
    let rendered_page = render_page(dir.path(), &cfg, None, &page).unwrap();
    assert!(
        rendered_page.html.contains("<q>B</q>"),
        "`.dejavu` layout should parse `<% %>`, got: {}",
        rendered_page.html
    );
    assert!(rendered_page.layout_id.ends_with("page.dejavu"));
}

#[test]
fn broken_doki_layout_failure_names_the_layout_and_page() {
    let dir = tempfile::tempdir().unwrap();
    write_layout(dir.path(), "layout.doki", "<b>{% end if %}oops</b>\n");
    let node = node_from_md("p.md", "---\ntitle: T\n---\n\nbody\n");
    let err = render_page(dir.path(), &theme_cfg(), None, &node)
        .expect_err("stray `{% end if %}` must fail the render");
    let msg = err.to_string();
    assert!(
        msg.contains("layout.doki"),
        "diagnostic should name the layout file, got: {msg}"
    );
    assert!(
        msg.contains("p.md"),
        "diagnostic should name the page, got: {msg}"
    );
}
