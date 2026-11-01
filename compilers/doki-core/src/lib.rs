//! Doki build core — project model, content graph, segmented build session.
//!
//! Does **not** depend on OXC or Node. Template render uses the Dejavu **public**
//! `dejavu` crate only. N-API bindings live in a separate crate.

mod config;
mod diagnostic;
mod error;
mod frontmatter;
mod graph;
mod i18n;
mod protocol;
mod render;
mod session;
mod site;
mod staging;

pub use config::{
    load_project_config, peek_theme_ref, theme_defaults_file, ExtensionRef, I18nConfig,
    LoadOptions, OverrideTarget, PluginEntry, ProjectConfig, ProjectPaths,
};
pub use diagnostic::{Diagnostic, Severity};
pub use error::{ConfigError, ConfigResult, CoreError, CoreResult};
pub use frontmatter::{parse_document, FrontMatter, ParsedDocument};
pub use i18n::{
    I18n, CATALOG_IO_CODE, CATALOG_SYNTAX_CODE, DUPLICATE_KEY_CODE, FALLBACK_CYCLE_CODE,
    MISSING_CATALOG_CODE, MISSING_KEY_CODE,
};
pub use graph::{
    discover_markdown_content, load_markdown_node, ContentGraph, ContentId, ContentKind,
    ContentNode, FrontMatterDto,
};
pub use protocol::{
    BuildMode, BuildPhase, BuildPlan, BuildResult, ExplainRebuild, ExtensionKind,
    ExtensionSourceKind, FileChange, FileChangeKind, HookKind, HookWorkItem, InvalidationResult,
    PluginResult, ResolvedExtension,
};
pub use render::{
    language_for_ext, markdown_to_html, render_page, render_taxonomy_page, RenderedPage,
    DEFAULT_LAYOUT,
};
pub use session::BuildSession;
pub use site::{
    PageType, SiteModel, SitePage, TagEntry, TaxonomyView, INVALID_LOCALE_CODE, INVALID_TYPE_CODE,
    ROUTE_CONFLICT_CODE, TAGS_INDEX_ID, TAXONOMY_CONFLICT_CODE,
};
