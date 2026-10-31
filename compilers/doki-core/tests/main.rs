//! Extension-profile and mixed `.doki` / `.dejavu` catalog regression gate for
//! doki-core render.
//!
//! Contract (per the Dejavu ecosystem gap analysis):
//! - `.doki` / `.dj` resolve to the `{% %}` profile **only**;
//! - `.dejavu`, `.html` (legacy) and extensionless sources resolve to the
//!   Dejavu default `<% %>` profile with no silent fallback;
//! - when both catalogs ship side by side, each layout file renders with its
//!   own extension-selected delimiters and failures name the layout.

use std::path::{Path, PathBuf};

use doki_core::{
    discover_markdown_content, language_for_ext, parse_document, render_page, ContentId,
    ContentKind, ContentNode, ExtensionRef, FrontMatterDto, ProjectConfig, SiteModel,
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

fn site_model(node: &ContentNode) -> (SiteModel, Vec<doki_core::Diagnostic>) {
    let mut graph = doki_core::ContentGraph::default();
    graph.insert(node.clone());
    SiteModel::build(&graph)
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
    let (site, diagnostics) = site_model(&node);
    assert!(diagnostics.is_empty(), "{diagnostics:?}");
    let page = render_page(dir.path(), &theme_cfg(), None, &node, &site, false).unwrap();
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
    let (site, diagnostics) = site_model(&node);
    assert!(diagnostics.is_empty(), "{diagnostics:?}");
    let page = render_page(dir.path(), &theme_cfg(), None, &node, &site, false).unwrap();
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
    let (site, diagnostics) = site_model(&node);
    assert!(diagnostics.is_empty(), "{diagnostics:?}");
    let page = render_page(dir.path(), &cfg, None, &node, &site, false).unwrap();
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
    let (site, diagnostics) = site_model(&node);
    assert!(diagnostics.is_empty(), "{diagnostics:?}");
    let page = render_page(dir.path(), &theme_cfg(), None, &node, &site, false).unwrap();
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
    let (post_site, diagnostics) = site_model(&post);
    assert!(diagnostics.is_empty(), "{diagnostics:?}");
    let rendered_post = render_page(dir.path(), &cfg, None, &post, &post_site, false).unwrap();
    assert!(
        rendered_post.html.contains("<p>A</p>"),
        "`.doki` layout should parse `{{% %}}`, got: {}",
        rendered_post.html
    );
    assert!(rendered_post.layout_id.ends_with("post.doki"));

    let page = node_from_md("b.md", "---\ntitle: B\nlayout: page\n---\n\nx\n");
    let (page_site, diagnostics) = site_model(&page);
    assert!(diagnostics.is_empty(), "{diagnostics:?}");
    let rendered_page = render_page(dir.path(), &cfg, None, &page, &page_site, false).unwrap();
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
    let (site, diagnostics) = site_model(&node);
    assert!(diagnostics.is_empty(), "{diagnostics:?}");
    let err = render_page(dir.path(), &theme_cfg(), None, &node, &site, false)
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

#[test]
fn markdown_links_rewrite_to_built_permalinks() {
    let dir = tempfile::tempdir().unwrap();
    let content = dir.path().join("content");
    std::fs::create_dir_all(content.join("posts")).unwrap();
    std::fs::write(
        content.join("index.md"),
        "---\ntitle: Home\n---\n\n- [Welcome](posts/welcome-to-fate/)\n\
         - [About](about/)\n- [External](https://example.com/)\n- [Unknown](nope/)\n",
    )
    .unwrap();
    std::fs::write(
        content.join("about.md"),
        "---\ntitle: About\n---\n\nback to [home](/)\n",
    )
    .unwrap();
    std::fs::write(
        content.join("posts/2025-06-15-welcome-to-fate.md"),
        "---\ntitle: Welcome\n---\n\nsee the [about page](/about/)\n",
    )
    .unwrap();

    let graph = discover_markdown_content(dir.path(), "content").unwrap();
    let (site, diagnostics) = SiteModel::build(&graph);
    assert!(diagnostics.is_empty(), "{diagnostics:?}");
    let cfg = ProjectConfig {
        title: "Site".into(),
        ..ProjectConfig::default()
    };

    let index = graph.nodes.get(&ContentId("index.md".into())).unwrap();
    let page = render_page(dir.path(), &cfg, None, index, &site, false).unwrap();
    assert!(
        page.html
            .contains(r#"<a href="/pages/posts/2025-06-15-welcome-to-fate.html">"#),
        "corpus-style post route should resolve to the built page, got: {}",
        page.html
    );
    assert!(page.html.contains(r#"<a href="/pages/about.html">"#));
    assert!(page.html.contains(r#"<a href="https://example.com/">"#));
    assert!(page.html.contains(r#"<a href="nope/">"#), "unknown route stays verbatim");
    assert!(
        !page.html.contains("posts/welcome-to-fate/"),
        "authored route must not survive the rewrite, got: {}",
        page.html
    );

    let post = graph
        .nodes
        .get(&ContentId("posts/2025-06-15-welcome-to-fate.md".into()))
        .unwrap();
    let page = render_page(dir.path(), &cfg, None, post, &site, false).unwrap();
    assert!(page.html.contains(r#"<a href="/pages/about.html">"#));
}

fn fate_examples_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples")
}

#[test]
fn fate_home_and_archive_list_site_model_posts_without_markdown_lists() {
    let examples = fate_examples_root();
    let graph = discover_markdown_content(&examples.join("_shared-corpus"), "content")
        .expect("shared corpus loads");
    let (site, diagnostics) = SiteModel::build(&graph);
    assert!(diagnostics.is_empty(), "{diagnostics:?}");
    let posts = site.posts(false);
    assert_eq!(
        posts.len(),
        6,
        "the shared corpus ships six published posts"
    );

    let theme = examples.join("doki-theme-fate");
    let cfg = ProjectConfig {
        title: "Fate · 清透角色的笔记".into(),
        description: Some("Notes, images, and small observations.".into()),
        author: Some("Fate".into()),
        lang: "zh-CN".into(),
        ..ProjectConfig::default()
    };

    for (rel, layout_file) in [
        ("index.md", "home.dejavu"),
        ("archive.md", "archive.dejavu"),
    ] {
        let node = graph
            .nodes
            .get(&ContentId(rel.into()))
            .unwrap_or_else(|| panic!("`{rel}` must exist in the shared corpus"));
        let page = render_page(&examples, &cfg, Some(&theme), node, &site, false)
            .expect("fate layout renders");
        assert!(
            page.layout_id.ends_with(layout_file),
            "`{rel}` should resolve to `{layout_file}`, got: {}",
            page.layout_id
        );
        assert!(
            page.html
                .contains(r#"href="/pages/posts/2025-10-20-building-a-theme.html""#),
            "`{rel}` should link the newest post by its site-model URL, got: {}",
            page.html
        );
        assert!(
            !page.html.contains("posts/building-a-theme/"),
            "authored route links must come from the site model, not Markdown, got: {}",
            page.html
        );
        for post in &posts {
            let href = format!(r#"href="{}""#, post.url);
            assert!(
                page.html.contains(&href),
                "`{rel}` is missing site-model post link `{href}`, got: {}",
                page.html
            );
        }
        let link_count = page.html.matches(r#"href="/pages/posts/"#).count();
        assert_eq!(
            link_count,
            posts.len(),
            "`{rel}` should render exactly one link per published post, got: {}",
            page.html
        );
    }
}

#[test]
fn site_model_exposes_page_permalink_to_layout() {
    let dir = tempfile::tempdir().unwrap();
    let content = dir.path().join("content");
    std::fs::create_dir_all(&content).unwrap();
    std::fs::write(content.join("p.md"), "---\ntitle: P\n---\n\nx\n").unwrap();
    write_layout(
        dir.path(),
        "layout.doki",
        "<loc>{% page.permalink %}</loc>\n",
    );

    let graph = discover_markdown_content(dir.path(), "content").unwrap();
    let (site, diagnostics) = SiteModel::build(&graph);
    assert!(diagnostics.is_empty(), "{diagnostics:?}");
    let node = graph.nodes.get(&ContentId("p.md".into())).unwrap();
    let page = render_page(dir.path(), &theme_cfg(), None, node, &site, false).unwrap();
    assert!(
        page.html.contains("<loc>/pages/p.html</loc>"),
        "layout should read `page.permalink`, got: {}",
        page.html
    );
}
