//! Serializable segmented-build protocol types (N-API / Node plugin container).
//!
//! No Rust pointers, Dejavu objects, or builder handles.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::diagnostic::Diagnostic;
use crate::graph::ContentId;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BuildMode {
    Development,
    Production,
    Check,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BuildPhase {
    /// Core finished discovery; may request `validateConfig` hooks.
    ValidateConfig,
    /// Ready for `transformContent` / `generateContent` batches.
    TransformContent,
    /// Core will render (Dejavu) — no plugin hooks in this stub phase yet.
    Render,
    /// Ready for `contributeArtifacts` / `buildComplete` batches after render.
    ContributeArtifacts,
    /// Ready for atomic commit.
    ReadyToCommit,
    /// Output committed.
    Committed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HookKind {
    ValidateConfig,
    DiscoverContent,
    TransformContent,
    GenerateContent,
    ContributeContext,
    TransformAsset,
    ContributeClientEntries,
    ContributeArtifacts,
    BuildComplete,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookWorkItem {
    pub hook: HookKind,
    pub plugin_id: String,
    /// Opaque JSON payload for the hook (domain snapshot, not internal objects).
    pub input: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginResult {
    pub plugin_id: String,
    pub hook: HookKind,
    #[serde(default)]
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub patch: Option<Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub diagnostics: Vec<Diagnostic>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub dependencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildPlan {
    pub build_id: String,
    pub mode: BuildMode,
    pub phase: BuildPhase,
    /// Empty when the core can advance without Node.
    pub pending_hooks: Vec<HookWorkItem>,
    pub content_count: usize,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildResult {
    pub build_id: String,
    pub output_dir: String,
    pub content_ids: Vec<ContentId>,
    pub committed_files: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub kind: FileChangeKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileChangeKind {
    Create,
    Modify,
    Remove,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvalidationResult {
    pub invalidated_content: Vec<ContentId>,
    pub rebuild_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedExtension {
    pub id: String,
    pub kind: ExtensionKind,
    pub source: ExtensionSourceKind,
    pub path: Option<String>,
    pub package: Option<String>,
    /// Absolute filesystem path after Node resolution (`path` or package root).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resolved_path: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplainRebuild {
    pub path: String,
    pub rebuild_required: bool,
    pub reason: String,
    pub invalidated_content: Vec<ContentId>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExtensionKind {
    Theme,
    Plugin,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExtensionSourceKind {
    /// From `path =` in doki.toml (Node still resolves absolute path).
    LocalPath,
    /// From `package =` (registry or workspace — Node fills real path later).
    Package,
}
