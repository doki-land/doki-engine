//! Build session: opaque project handle + segmented build protocol.
//!
//! Node drives `prepare_build` / `continue_build` / `commit_build`; this module
//! owns content graph and phase authority. No Dejavu / OXC yet.

use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::json;

use crate::config::{load_project_config, LoadOptions, ProjectConfig, ProjectPaths};
use crate::diagnostic::Diagnostic;
use crate::error::{CoreError, CoreResult};
use crate::graph::{discover_markdown_content, load_markdown_node, ContentGraph, ContentId};
use crate::protocol::{
    BuildMode, BuildPhase, BuildPlan, BuildResult, ExplainRebuild, ExtensionKind,
    ExtensionSourceKind, FileChange, FileChangeKind, HookKind, HookWorkItem, InvalidationResult,
    PluginResult, ResolvedExtension,
};
use crate::render::render_page;
use crate::site::{output_rel, SiteModel, SitePage, ROUTE_CONFLICT_CODE};
use crate::staging::StagingArea;

static SESSION_SEQ: AtomicU64 = AtomicU64::new(1);
static BUILD_SEQ: AtomicU64 = AtomicU64::new(1);

fn next_session_id() -> String {
    format!("sess-{}", SESSION_SEQ.fetch_add(1, Ordering::Relaxed))
}

fn next_build_id() -> String {
    format!("build-{}", BUILD_SEQ.fetch_add(1, Ordering::Relaxed))
}

#[derive(Debug)]
struct ActiveBuild {
    build_id: String,
    mode: BuildMode,
    phase: BuildPhase,
    diagnostics: Vec<Diagnostic>,
    cancelled: bool,
    /// Site model authority for render jobs, hook payloads and manifests.
    site: SiteModel,
    staging: StagingArea,
    /// `None` = render all publishable pages; `Some` = only these ids (incremental).
    render_ids: Option<BTreeSet<ContentId>>,
    /// When true, commit deletes output paths from the previous manifest that are gone.
    full_output_replace: bool,
}

/// Opaque project session (future N-API: only the string `id` crosses the boundary).
#[derive(Debug)]
pub struct BuildSession {
    pub id: String,
    paths: ProjectPaths,
    config: ProjectConfig,
    graph: ContentGraph,
    extensions: Vec<ResolvedExtension>,
    active: Option<ActiveBuild>,
    disposed: bool,
    /// Content ids touched since last successful full/partial prepare.
    dirty: BTreeSet<ContentId>,
    /// Config / structural change requires rediscovery.
    needs_full_rediscover: bool,
    /// Relative output paths from last successful commit (for cleanup).
    last_committed: BTreeSet<String>,
    /// Output-relative paths to delete on the next commit (removed content).
    pending_deletes: BTreeSet<String>,
    /// Preserved across config reloads (package-theme defaults from Node).
    theme_defaults: Option<PathBuf>,
    allow_local: bool,
}

impl BuildSession {
    /// Load config, discover markdown content, resolve declared extensions (path/package only).
    pub fn open_project(
        root: impl AsRef<std::path::Path>,
        options: LoadOptions,
    ) -> CoreResult<Self> {
        let (paths, config) = load_project_config(root, options.clone())?;
        let graph = discover_markdown_content(&paths.root, &config.content_dir)?;
        let extensions = resolve_declared_extensions(&config);
        Ok(Self {
            id: next_session_id(),
            paths,
            config,
            graph,
            extensions,
            active: None,
            disposed: false,
            dirty: BTreeSet::new(),
            needs_full_rediscover: false,
            last_committed: BTreeSet::new(),
            pending_deletes: BTreeSet::new(),
            theme_defaults: options.theme_defaults.clone(),
            allow_local: options.allow_local,
        })
    }

    pub fn project_root(&self) -> &std::path::Path {
        &self.paths.root
    }

    pub fn config(&self) -> &ProjectConfig {
        &self.config
    }

    pub fn graph(&self) -> &ContentGraph {
        &self.graph
    }

    pub fn extensions(&self) -> &[ResolvedExtension] {
        &self.extensions
    }

    pub fn is_disposed(&self) -> bool {
        self.disposed
    }

    fn ensure_alive(&self) -> CoreResult<()> {
        if self.disposed {
            return Err(CoreError::session("session already disposed"));
        }
        Ok(())
    }

    fn content_root(&self) -> PathBuf {
        self.paths.root.join(&self.config.content_dir)
    }

    fn include_drafts(&self, mode: BuildMode) -> bool {
        matches!(mode, BuildMode::Development)
    }

    /// Serialized site pages visible to plugins in the active build mode.
    fn pages_json(&self, active: &ActiveBuild) -> serde_json::Value {
        let include_drafts = self.include_drafts(active.mode);
        let pages: Vec<&SitePage> = active
            .site
            .pages()
            .iter()
            .filter(|page| include_drafts || !page.draft)
            .collect();
        serde_json::to_value(pages).expect("site pages serialize")
    }

    /// Site summary handed to artifact plugins.
    fn site_json(&self, active: &ActiveBuild) -> serde_json::Value {
        let include_drafts = self.include_drafts(active.mode);
        json!({
            "title": self.config.title,
            "baseUrl": self.config.base_url,
            "lang": self.config.lang,
            "postCount": active.site.posts(include_drafts).len(),
        })
    }

    /// Start (or restart) a segmented build. Returns the first plan; may already be ReadyToCommit
    /// when no plugin hooks are pending.
    pub fn prepare_build(&mut self, mode: BuildMode) -> CoreResult<BuildPlan> {
        self.ensure_alive()?;
        if let Some(active) = &self.active {
            if !active.cancelled && active.phase != BuildPhase::Committed {
                return Err(CoreError::build(
                    "a build is already active; commit, cancel, or dispose first",
                ));
            }
        }

        let incremental = self.config.incremental
            && !self.needs_full_rediscover
            && !self.dirty.is_empty()
            && !self.last_committed.is_empty()
            && !matches!(mode, BuildMode::Check);

        let (render_ids, full_output_replace) = if incremental {
            let mut ids = BTreeSet::new();
            for id in &self.dirty {
                ids.extend(self.graph.invalidate_closure(id));
            }
            // Drop drafts from incremental render set in production.
            if !self.include_drafts(mode) {
                ids.retain(|id| {
                    self.graph
                        .nodes
                        .get(id)
                        .map(|n| !n.front_matter.draft)
                        .unwrap_or(false)
                });
            }
            (Some(ids), false)
        } else {
            if self.needs_full_rediscover || self.dirty.is_empty() || self.last_committed.is_empty()
            {
                self.graph =
                    discover_markdown_content(&self.paths.root, &self.config.content_dir)?;
            }
            let previous = self.extensions.clone();
            self.extensions = resolve_declared_extensions(&self.config);
            for ext in &mut self.extensions {
                if let Some(prev) = previous.iter().find(|p| p.id == ext.id) {
                    ext.resolved_path = prev.resolved_path.clone();
                }
            }
            self.needs_full_rediscover = false;
            (None, true)
        };

        self.dirty.clear();

        let build_id = next_build_id();
        let output_root = self.paths.root.join(&self.config.output_dir);
        let staging = StagingArea::create(&output_root, &build_id)?;

        let (site, site_diagnostics) = SiteModel::build(&self.graph);
        let conflicts: Vec<Diagnostic> = site_diagnostics
            .iter()
            .filter(|diagnostic| diagnostic.code == ROUTE_CONFLICT_CODE)
            .cloned()
            .collect();

        let active = ActiveBuild {
            build_id,
            mode,
            phase: BuildPhase::ValidateConfig,
            diagnostics: site_diagnostics,
            cancelled: false,
            site,
            staging,
            render_ids,
            full_output_replace,
        };

        if !conflicts.is_empty() {
            active.staging.discard();
            let message = conflicts
                .iter()
                .map(|diagnostic| format!("{}: {}", diagnostic.code, diagnostic.message))
                .collect::<Vec<_>>()
                .join("\n");
            return Err(CoreError::build(message));
        }

        self.active = Some(active);

        self.skip_empty_hook_phases()
    }

    /// Apply one batch of plugin results and advance.
    pub fn continue_build(&mut self, results: Vec<PluginResult>) -> CoreResult<BuildPlan> {
        self.ensure_alive()?;
        {
            let active = self
                .active
                .as_mut()
                .ok_or_else(|| CoreError::build("no active build; call prepare_build first"))?;
            if active.cancelled {
                return Err(CoreError::build("build was cancelled"));
            }
            if matches!(
                active.phase,
                BuildPhase::ReadyToCommit | BuildPhase::Committed
            ) {
                return Err(CoreError::build(
                    "build is ready to commit or already committed; call commit_build",
                ));
            }

            for result in &results {
                active.diagnostics.extend(result.diagnostics.clone());
                if !result.ok {
                    return Err(CoreError::build(format!(
                        "plugin `{}` failed hook {:?}",
                        result.plugin_id, result.hook
                    )));
                }
                if let Some(patch) = &result.patch {
                    apply_artifact_patch(&mut active.staging, patch)?;
                }
            }

            active.phase = match active.phase {
                BuildPhase::ValidateConfig => BuildPhase::TransformContent,
                BuildPhase::TransformContent => BuildPhase::Render,
                BuildPhase::ContributeArtifacts => BuildPhase::ReadyToCommit,
                BuildPhase::Render => BuildPhase::ContributeArtifacts,
                BuildPhase::ReadyToCommit | BuildPhase::Committed => unreachable!(),
            };
        }

        self.skip_empty_hook_phases()
    }

    fn skip_empty_hook_phases(&mut self) -> CoreResult<BuildPlan> {
        loop {
            let phase = self
                .active
                .as_ref()
                .ok_or_else(|| CoreError::build("no active build"))?
                .phase;

            if matches!(phase, BuildPhase::ReadyToCommit | BuildPhase::Committed) {
                return Ok(self.plan_for_current_phase());
            }

            if phase == BuildPhase::Render {
                self.run_render()?;
                if let Some(active) = self.active.as_mut() {
                    active.phase = BuildPhase::ContributeArtifacts;
                }
                continue;
            }

            let plan = self.plan_for_current_phase();
            if !plan.pending_hooks.is_empty() {
                return Ok(plan);
            }

            if let Some(active) = self.active.as_mut() {
                active.phase = match active.phase {
                    BuildPhase::ValidateConfig => BuildPhase::TransformContent,
                    BuildPhase::TransformContent => BuildPhase::Render,
                    BuildPhase::ContributeArtifacts => BuildPhase::ReadyToCommit,
                    other => other,
                };
            }
        }
    }

    /// Promote staging into `output_dir`.
    pub fn commit_build(&mut self) -> CoreResult<BuildResult> {
        self.ensure_alive()?;
        let active = self
            .active
            .as_ref()
            .ok_or_else(|| CoreError::build("no active build"))?;
        if active.cancelled {
            return Err(CoreError::build("build was cancelled"));
        }
        if active.phase != BuildPhase::ReadyToCommit {
            return Err(CoreError::build(format!(
                "cannot commit in phase {:?}; finish continue_build first",
                active.phase
            )));
        }

        let active = self.active.take().expect("active build");
        let build_id = active.build_id.clone();
        let diagnostics = active.diagnostics.clone();
        let mode = active.mode;
        let full_replace = active.full_output_replace;
        let output_dir = self.paths.root.join(&self.config.output_dir);

        let include_drafts = self.include_drafts(mode);
        let pages: Vec<&SitePage> = active
            .site
            .pages()
            .iter()
            .filter(|page| include_drafts || !page.draft)
            .collect();
        let content_ids: Vec<ContentId> = pages.iter().map(|page| page.id.clone()).collect();
        let page_files: Vec<String> = pages.iter().map(|page| page.output.clone()).collect();
        let manifest = json!({
            "buildId": build_id,
            "title": self.config.title,
            "content": content_ids.iter().map(|id| &id.0).collect::<Vec<_>>(),
            "pages": pages,
            "files": page_files,
        });

        let staging = active.staging;
        staging.write_file(
            "doki-manifest.json",
            serde_json::to_vec_pretty(&manifest).expect("manifest serialize"),
        )?;

        let replace_set = if full_replace {
            Some(self.last_committed.clone())
        } else {
            None
        };
        let mut committed = staging.commit_into(&output_dir, replace_set.as_ref())?;

        for rel in std::mem::take(&mut self.pending_deletes) {
            let path = output_dir.join(&rel);
            if path.is_file() {
                let _ = fs::remove_file(&path);
            }
            self.last_committed.remove(&rel);
        }

        if full_replace {
            self.last_committed = committed.iter().cloned().collect();
        } else {
            for f in &committed {
                self.last_committed.insert(f.clone());
            }
        }

        committed.sort();
        committed.dedup();

        // Official build manifest under dist/.doki/
        let doki_meta = output_dir.join(".doki");
        fs::create_dir_all(&doki_meta).map_err(|source| CoreError::Io { source })?;
        let build_manifest = json!({
            "buildId": build_id,
            "title": self.config.title,
            "mode": format!("{:?}", mode).to_lowercase(),
            "outputDir": self.config.output_dir,
            "content": content_ids.iter().map(|id| &id.0).collect::<Vec<_>>(),
            "pages": pages,
            "files": &committed,
            "extensions": &self.extensions,
            "incremental": self.config.incremental && !full_replace,
            "diagnostics": &diagnostics,
        });
        let manifest_rel = ".doki/build-manifest.json";
        fs::write(
            doki_meta.join("build-manifest.json"),
            serde_json::to_vec_pretty(&build_manifest).expect("build manifest"),
        )
        .map_err(|source| CoreError::Io { source })?;
        if !committed.iter().any(|f| f == manifest_rel) {
            committed.push(manifest_rel.into());
            self.last_committed.insert(manifest_rel.into());
        }

        Ok(BuildResult {
            build_id,
            output_dir: self.config.output_dir.clone(),
            content_ids,
            committed_files: committed,
            diagnostics,
        })
    }

    /// Replace extension list with Node-resolved absolute paths (same ids).
    pub fn set_resolved_extensions(&mut self, extensions: Vec<ResolvedExtension>) -> CoreResult<()> {
        self.ensure_alive()?;
        self.extensions = extensions;
        Ok(())
    }

    /// Explain whether a relative project path would force a rebuild.
    pub fn explain_rebuild(&mut self, path: &str) -> CoreResult<ExplainRebuild> {
        self.ensure_alive()?;
        let change = FileChange {
            path: path.replace('\\', "/"),
            kind: FileChangeKind::Modify,
        };
        let inv = self.invalidate(std::slice::from_ref(&change))?;
        let reason = if is_config_path(&change.path) {
            "project config change requires full rediscovery".into()
        } else if !inv.invalidated_content.is_empty() {
            format!(
                "content graph invalidates {} page(s)",
                inv.invalidated_content.len()
            )
        } else if inv.rebuild_required {
            "non-content path marked rebuild (theme/public/other)".into()
        } else {
            "no rebuild required for this path".into()
        };
        Ok(ExplainRebuild {
            path: change.path,
            rebuild_required: inv.rebuild_required,
            reason,
            invalidated_content: inv.invalidated_content,
        })
    }

    /// Apply filesystem changes to the content graph and dirty set.
    pub fn invalidate(&mut self, changes: &[FileChange]) -> CoreResult<InvalidationResult> {
        self.ensure_alive()?;
        let mut invalidated = BTreeSet::new();
        let content_prefix = format!("{}/", self.config.content_dir.trim_end_matches('/'));
        let content_root = self.content_root();

        for change in changes {
            let norm = change.path.replace('\\', "/");

            if is_config_path(&norm) {
                self.needs_full_rediscover = true;
                // Reload config immediately so subsequent prepare sees new values.
                let (paths, config) = load_project_config(
                    &self.paths.root,
                    LoadOptions {
                        allow_local: self.allow_local,
                        theme_defaults: self.theme_defaults.clone(),
                    },
                )?;
                self.paths = paths;
                self.config = config;
                self.extensions = resolve_declared_extensions(&self.config);
                continue;
            }

            let Some(rel) = content_rel(&norm, &content_prefix, &self.config.content_dir) else {
                // Non-content change (public/theme later) → full rediscover for safety.
                self.needs_full_rediscover = true;
                continue;
            };

            if !is_markdown_rel(&rel) {
                continue;
            }

            let id = ContentId(rel.clone());
            match change.kind {
                FileChangeKind::Remove => {
                    let closure = self.graph.invalidate_closure(&id);
                    if let Some(node) = self.graph.remove(&id) {
                        self.pending_deletes.insert(output_rel(&node.rel_path));
                        invalidated.extend(closure);
                        self.dirty.insert(id);
                    }
                }
                FileChangeKind::Create | FileChangeKind::Modify => {
                    let abs = content_root.join(&rel);
                    if abs.is_file() {
                        let node = load_markdown_node(&content_root, &abs)?;
                        let closure = self.graph.invalidate_closure(&node.id);
                        self.pending_deletes.remove(&output_rel(&node.rel_path));
                        self.graph.insert(node);
                        invalidated.extend(closure);
                        self.dirty.insert(id);
                    } else if change.kind == FileChangeKind::Modify {
                        let closure = self.graph.invalidate_closure(&id);
                        if let Some(node) = self.graph.remove(&id) {
                            self.pending_deletes.insert(output_rel(&node.rel_path));
                            invalidated.extend(closure);
                            self.dirty.insert(id);
                        }
                    }
                }
            }
        }

        let rebuild_required = self.needs_full_rediscover || !invalidated.is_empty();
        Ok(InvalidationResult {
            invalidated_content: invalidated.into_iter().collect(),
            rebuild_required,
        })
    }

    pub fn cancel(&mut self) -> CoreResult<()> {
        self.ensure_alive()?;
        if let Some(mut active) = self.active.take() {
            active.cancelled = true;
            active.staging.discard();
        }
        Ok(())
    }

    pub fn dispose(&mut self) {
        if self.disposed {
            return;
        }
        let _ = self.cancel();
        self.disposed = true;
        self.active = None;
    }

    fn enabled_plugin_ids(&self) -> Vec<String> {
        self.extensions
            .iter()
            .filter(|e| e.kind == ExtensionKind::Plugin && e.enabled)
            .map(|e| e.id.clone())
            .collect()
    }

    fn theme_fs_root(&self) -> Option<PathBuf> {
        let theme = self
            .extensions
            .iter()
            .find(|e| e.kind == ExtensionKind::Theme)?;
        if let Some(resolved) = &theme.resolved_path {
            return Some(PathBuf::from(resolved));
        }
        theme
            .path
            .as_ref()
            .map(|p| self.paths.root.join(p))
    }

    fn plan_for_current_phase(&self) -> BuildPlan {
        let active = self.active.as_ref().expect("active build");
        let pending_hooks = match active.phase {
            BuildPhase::ValidateConfig => self.hooks_for(HookKind::ValidateConfig, |id| {
                json!({
                    "pluginId": id,
                    "title": self.config.title,
                    "contentDir": self.config.content_dir,
                    "outputDir": self.config.output_dir,
                })
            }),
            BuildPhase::TransformContent => {
                let pages = self.pages_json(active);
                let mut items = self.hooks_for(HookKind::TransformContent, |id| {
                    json!({
                        "pluginId": id,
                        "pages": pages,
                    })
                });
                items.extend(self.hooks_for(HookKind::GenerateContent, |id| {
                    json!({ "pluginId": id })
                }));
                items
            }
            BuildPhase::ContributeArtifacts => {
                let pages = self.pages_json(active);
                let site = self.site_json(active);
                let mut items = self.hooks_for(HookKind::ContributeArtifacts, |id| {
                    json!({
                        "pluginId": id,
                        "site": site,
                        "pages": pages,
                        "outputDir": self.config.output_dir,
                    })
                });
                items.extend(self.hooks_for(HookKind::BuildComplete, |id| {
                    json!({
                        "pluginId": id,
                        "pages": pages,
                        "readOnly": true,
                    })
                }));
                items
            }
            BuildPhase::Render | BuildPhase::ReadyToCommit | BuildPhase::Committed => Vec::new(),
        };

        let content_count = match &active.render_ids {
            Some(set) => set.len(),
            None => {
                let include_drafts = self.include_drafts(active.mode);
                active
                    .site
                    .pages()
                    .iter()
                    .filter(|page| include_drafts || !page.draft)
                    .count()
            }
        };

        BuildPlan {
            build_id: active.build_id.clone(),
            mode: active.mode,
            phase: active.phase,
            pending_hooks,
            content_count,
            diagnostics: active.diagnostics.clone(),
        }
    }

    fn hooks_for(
        &self,
        hook: HookKind,
        input: impl Fn(&str) -> serde_json::Value,
    ) -> Vec<HookWorkItem> {
        self.enabled_plugin_ids()
            .into_iter()
            .map(|plugin_id| {
                let input = input(&plugin_id);
                HookWorkItem {
                    hook,
                    plugin_id,
                    input,
                }
            })
            .collect()
    }

    fn run_render(&mut self) -> CoreResult<()> {
        let (mode, site_render_ids) = {
            let active = self
                .active
                .as_ref()
                .ok_or_else(|| CoreError::build("no active build"))?;
            (active.mode, active.render_ids.clone())
        };
        let include_drafts = self.include_drafts(mode);
        let render_ids: BTreeSet<ContentId> = match site_render_ids {
            Some(ids) => ids,
            None => self
                .active
                .as_ref()
                .expect("active build")
                .site
                .pages()
                .iter()
                .filter(|page| include_drafts || !page.draft)
                .map(|page| page.id.clone())
                .collect(),
        };

        let root = self.paths.root.clone();
        let theme_root = self.theme_fs_root();
        let site = &self.active.as_ref().expect("active build").site;
        let jobs: Vec<(ContentId, String, String, String)> = render_ids
            .iter()
            .filter_map(|id| self.graph.nodes.get(id).map(|node| (id.clone(), node)))
            .map(|(id, node)| {
                let output = site
                    .page(&node.rel_path)
                    .map(|page| page.output.clone())
                    .ok_or_else(|| {
                        CoreError::build(format!("no site page for `{}`", node.rel_path))
                    })?;
                let page = render_page(
                    &root,
                    &self.config,
                    theme_root.as_deref(),
                    node,
                    site,
                    include_drafts,
                )?;
                Ok((id, output, page.html, page.layout_id))
            })
            .collect::<CoreResult<Vec<_>>>()?;

        for (id, _rel, _html, layout_id) in &jobs {
            let dep = ContentId(format!("@layout/{layout_id}"));
            self.graph
                .edges
                .entry(id.clone())
                .or_default()
                .insert(dep);
        }

        let public_dir = self.paths.root.join(&self.config.public_dir);
        let theme_assets = self.theme_fs_root().map(|r| r.join("assets"));

        let staging = &mut self
            .active
            .as_mut()
            .ok_or_else(|| CoreError::build("no active build"))?
            .staging;
        for (_id, rel, html, _layout) in jobs {
            staging.write_file(&rel, html)?;
        }

        // Project public/ + theme assets/ → staging (declarative theme resources).
        copy_dir_into_staging(staging, &public_dir, "")?;
        if let Some(assets) = theme_assets {
            copy_dir_into_staging(staging, &assets, "assets")?;
        }
        Ok(())
    }
}

fn copy_dir_into_staging(
    staging: &StagingArea,
    src: &std::path::Path,
    dest_prefix: &str,
) -> CoreResult<()> {
    if !src.is_dir() {
        return Ok(());
    }
    fn walk(
        staging: &StagingArea,
        dir: &std::path::Path,
        prefix: &str,
    ) -> CoreResult<()> {
        for entry in fs::read_dir(dir).map_err(|source| CoreError::Io { source })? {
            let entry = entry.map_err(|source| CoreError::Io { source })?;
            let path = entry.path();
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name == ".gitkeep" || name == ".DS_Store" {
                continue;
            }
            let rel = if prefix.is_empty() {
                name.to_string()
            } else {
                format!("{prefix}/{name}")
            };
            if path.is_dir() {
                walk(staging, &path, &rel)?;
            } else if path.is_file() {
                let bytes = fs::read(&path).map_err(|source| CoreError::Io { source })?;
                staging.write_file(&rel, bytes)?;
            }
        }
        Ok(())
    }
    walk(staging, src, dest_prefix)
}

fn apply_artifact_patch(
    staging: &mut StagingArea,
    patch: &serde_json::Value,
) -> CoreResult<()> {
    let Some(artifacts) = patch.get("artifacts").and_then(|v| v.as_array()) else {
        return Ok(());
    };
    for item in artifacts {
        let path = item
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CoreError::build("artifact patch missing path"))?;
        let norm = path.replace('\\', "/");
        if norm.is_empty()
            || norm.starts_with('/')
            || norm.contains("..")
            || PathBuf::from(&norm).is_absolute()
        {
            return Err(CoreError::build(format!(
                "refusing unsafe artifact path `{norm}`"
            )));
        }
        let contents = item
            .get("contents")
            .and_then(|v| v.as_str())
            .ok_or_else(|| CoreError::build(format!("artifact `{norm}` missing contents")))?;
        staging.write_file(&norm, contents.as_bytes())?;
    }
    Ok(())
}

fn is_config_path(norm: &str) -> bool {
    let name = norm.rsplit('/').next().unwrap_or(norm);
    name == "doki.toml" || name == "doki.local.toml"
}

fn content_rel(norm: &str, content_prefix: &str, content_dir: &str) -> Option<String> {
    if let Some(stripped) = norm.strip_prefix(content_prefix) {
        return Some(stripped.to_string());
    }
    if content_dir == "content" {
        if let Some(stripped) = norm.strip_prefix("content/") {
            return Some(stripped.to_string());
        }
    }
    None
}

fn is_markdown_rel(rel: &str) -> bool {
    matches!(
        rel.rsplit('.').next().unwrap_or(""),
        "md" | "mdx" | "markdown"
    )
}

fn resolve_declared_extensions(config: &ProjectConfig) -> Vec<ResolvedExtension> {
    let mut out = Vec::new();
    if let Some(theme) = &config.theme {
        let (source, path, package) = if theme.path.is_some() {
            (ExtensionSourceKind::LocalPath, theme.path.clone(), None)
        } else {
            (
                ExtensionSourceKind::Package,
                None,
                theme.package.clone(),
            )
        };
        let id = path
            .clone()
            .or_else(|| package.clone())
            .unwrap_or_else(|| "theme".into());
        out.push(ResolvedExtension {
            id,
            kind: ExtensionKind::Theme,
            source,
            path,
            package,
            resolved_path: None,
            enabled: true,
        });
    }
    for (i, plugin) in config.plugins.iter().enumerate() {
        let (source, path, package) = if plugin.path.is_some() {
            (ExtensionSourceKind::LocalPath, plugin.path.clone(), None)
        } else {
            (
                ExtensionSourceKind::Package,
                None,
                plugin.package.clone(),
            )
        };
        let id = path
            .clone()
            .or_else(|| package.clone())
            .unwrap_or_else(|| format!("plugin-{i}"));
        out.push(ResolvedExtension {
            id,
            kind: ExtensionKind::Plugin,
            source,
            path,
            package,
            resolved_path: None,
            enabled: plugin.enabled,
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn advance(session: &mut BuildSession, plan: BuildPlan) -> BuildPlan {
        let results: Vec<PluginResult> = plan
            .pending_hooks
            .iter()
            .map(|hook| PluginResult {
                plugin_id: hook.plugin_id.clone(),
                hook: hook.hook,
                ok: true,
                patch: None,
                diagnostics: vec![],
                dependencies: vec![],
            })
            .collect();
        session.continue_build(results).unwrap()
    }

    fn write_min_project(dir: &std::path::Path) {
        fs::write(
            dir.join("doki.toml"),
            r#"
title = "Session Site"
content_dir = "content"
output_dir = "dist"
incremental = true
"#,
        )
        .unwrap();
        fs::create_dir_all(dir.join("content")).unwrap();
        fs::write(
            dir.join("content/hello.md"),
            "---\ntitle: Hello\n---\n\n# Hello\n",
        )
        .unwrap();
        fs::write(dir.join("content/about.md"), "# About\n").unwrap();
    }

    #[test]
    fn open_parses_front_matter() {
        let dir = tempfile::tempdir().unwrap();
        write_min_project(dir.path());
        let session = BuildSession::open_project(dir.path(), LoadOptions::default()).unwrap();
        assert_eq!(session.graph().len(), 2);
        let hello = session
            .graph()
            .nodes
            .get(&ContentId("hello.md".into()))
            .unwrap();
        assert_eq!(hello.front_matter.title.as_deref(), Some("Hello"));
        assert!(!hello.content_hash.is_empty());
    }

    #[test]
    fn production_skips_drafts() {
        let dir = tempfile::tempdir().unwrap();
        write_min_project(dir.path());
        fs::write(
            dir.path().join("content/secret.md"),
            "---\ntitle: Secret\ndraft: true\n---\n\nhidden\n",
        )
        .unwrap();
        let mut session = BuildSession::open_project(dir.path(), LoadOptions::default()).unwrap();
        assert_eq!(session.graph().len(), 3);
        let plan = session.prepare_build(BuildMode::Production).unwrap();
        assert_eq!(plan.phase, BuildPhase::ReadyToCommit);
        assert_eq!(plan.content_count, 2);
        let result = session.commit_build().unwrap();
        assert_eq!(result.content_ids.len(), 2);
        assert!(!dir
            .path()
            .join("dist/pages/secret.html")
            .exists());
        assert!(dir.path().join("dist/pages/hello.html").is_file());
        let manifest: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(dir.path().join("dist/doki-manifest.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(manifest["content"], json!(["about.md", "hello.md"]));
        let pages = manifest["pages"].as_array().unwrap();
        assert_eq!(pages.len(), 2);
        assert!(pages.iter().all(|page| page["draft"] == false));
        assert!(pages.iter().any(|page| page["relPath"] == "hello.md"));
    }

    #[test]
    fn build_without_plugins_commits_mirrored_pages() {
        let dir = tempfile::tempdir().unwrap();
        write_min_project(dir.path());
        let mut session = BuildSession::open_project(dir.path(), LoadOptions::default()).unwrap();
        let plan = session.prepare_build(BuildMode::Production).unwrap();
        assert_eq!(plan.phase, BuildPhase::ReadyToCommit);
        let result = session.commit_build().unwrap();
        assert!(result
            .committed_files
            .iter()
            .any(|f| f == "doki-manifest.json"));
        assert!(result
            .committed_files
            .iter()
            .any(|f| f == "pages/hello.html"));
        let html = fs::read_to_string(dir.path().join("dist/pages/hello.html")).unwrap();
        assert!(html.contains("<title>Hello</title>") || html.contains("Hello"));
        assert!(html.contains("<h1>Hello</h1>") || html.contains("Hello"));
        let build_manifest: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(dir.path().join("dist/.doki/build-manifest.json")).unwrap(),
        )
        .unwrap();
        let pages = build_manifest["pages"].as_array().unwrap();
        assert_eq!(pages.len(), 2);
        assert_eq!(pages[0]["id"], "about.md");
        assert_eq!(pages[1]["id"], "hello.md");
        assert_eq!(pages[1]["type"], "page");
        assert_eq!(pages[1]["route"], "/hello/");
        assert_eq!(pages[1]["output"], "pages/hello.html");
        assert_eq!(pages[1]["url"], "/pages/hello.html");
    }

    #[test]
    fn invalidate_reloads_and_incremental_rebuild() {
        let dir = tempfile::tempdir().unwrap();
        write_min_project(dir.path());
        let mut session = BuildSession::open_project(dir.path(), LoadOptions::default()).unwrap();
        session.prepare_build(BuildMode::Production).unwrap();
        session.commit_build().unwrap();

        fs::write(
            dir.path().join("content/hello.md"),
            "---\ntitle: Hello v2\n---\n\nupdated\n",
        )
        .unwrap();
        let inv = session
            .invalidate(&[FileChange {
                path: "content/hello.md".into(),
                kind: FileChangeKind::Modify,
            }])
            .unwrap();
        assert!(inv.rebuild_required);
        assert_eq!(
            session
                .graph()
                .nodes
                .get(&ContentId("hello.md".into()))
                .unwrap()
                .front_matter
                .title
                .as_deref(),
            Some("Hello v2")
        );

        let plan = session.prepare_build(BuildMode::Production).unwrap();
        assert_eq!(plan.content_count, 1); // only dirty hello
        session.commit_build().unwrap();
        let html = fs::read_to_string(dir.path().join("dist/pages/hello.html")).unwrap();
        assert!(html.contains("Hello v2"));
        // about.html from first full build should remain
        assert!(dir.path().join("dist/pages/about.html").is_file());
    }

    #[test]
    fn invalidate_remove_drops_node() {
        let dir = tempfile::tempdir().unwrap();
        write_min_project(dir.path());
        let mut session = BuildSession::open_project(dir.path(), LoadOptions::default()).unwrap();
        fs::remove_file(dir.path().join("content/about.md")).unwrap();
        let inv = session
            .invalidate(&[FileChange {
                path: "content/about.md".into(),
                kind: FileChangeKind::Remove,
            }])
            .unwrap();
        assert!(inv
            .invalidated_content
            .contains(&ContentId("about.md".into())));
        assert_eq!(session.graph().len(), 1);
    }

    #[test]
    fn incremental_remove_deletes_output() {
        let dir = tempfile::tempdir().unwrap();
        write_min_project(dir.path());
        let mut session = BuildSession::open_project(dir.path(), LoadOptions::default()).unwrap();
        session.prepare_build(BuildMode::Production).unwrap();
        session.commit_build().unwrap();
        assert!(dir.path().join("dist/pages/about.html").is_file());

        fs::remove_file(dir.path().join("content/about.md")).unwrap();
        session
            .invalidate(&[FileChange {
                path: "content/about.md".into(),
                kind: FileChangeKind::Remove,
            }])
            .unwrap();
        session.prepare_build(BuildMode::Production).unwrap();
        session.commit_build().unwrap();
        assert!(!dir.path().join("dist/pages/about.html").exists());
        assert!(dir.path().join("dist/pages/hello.html").is_file());
    }

    #[test]
    fn full_rebuild_removes_stale_outputs() {
        let dir = tempfile::tempdir().unwrap();
        write_min_project(dir.path());
        let mut session = BuildSession::open_project(dir.path(), LoadOptions::default()).unwrap();
        session.prepare_build(BuildMode::Production).unwrap();
        session.commit_build().unwrap();
        assert!(dir.path().join("dist/pages/about.html").is_file());

        fs::remove_file(dir.path().join("content/about.md")).unwrap();
        session
            .invalidate(&[FileChange {
                path: "content/about.md".into(),
                kind: FileChangeKind::Remove,
            }])
            .unwrap();
        // Config touch forces full rediscover + output replace.
        session
            .invalidate(&[FileChange {
                path: "doki.toml".into(),
                kind: FileChangeKind::Modify,
            }])
            .unwrap();
        session.prepare_build(BuildMode::Production).unwrap();
        session.commit_build().unwrap();
        assert!(!dir.path().join("dist/pages/about.html").exists());
        assert!(dir.path().join("dist/pages/hello.html").is_file());
    }

    #[test]
    fn prepare_emits_validate_hooks_for_plugins() {
        let dir = tempfile::tempdir().unwrap();
        write_min_project(dir.path());
        fs::write(
            dir.path().join("doki.toml"),
            r#"
title = "With Plugin"
[[plugins]]
package = "@doki-land/plugin-search"
enabled = true
[[plugins]]
path = "./plugins/local"
enabled = false
"#,
        )
        .unwrap();

        let mut session = BuildSession::open_project(dir.path(), LoadOptions::default()).unwrap();
        let plan = session.prepare_build(BuildMode::Development).unwrap();
        assert_eq!(plan.pending_hooks.len(), 1);
        assert_eq!(plan.pending_hooks[0].hook, HookKind::ValidateConfig);

        let plan = session
            .continue_build(vec![PluginResult {
                plugin_id: "@doki-land/plugin-search".into(),
                hook: HookKind::ValidateConfig,
                ok: true,
                patch: None,
                diagnostics: vec![],
                dependencies: vec![],
            }])
            .unwrap();
        assert_eq!(plan.phase, BuildPhase::TransformContent);
        let results: Vec<_> = plan
            .pending_hooks
            .iter()
            .map(|h| PluginResult {
                plugin_id: h.plugin_id.clone(),
                hook: h.hook,
                ok: true,
                patch: None,
                diagnostics: vec![],
                dependencies: vec![],
            })
            .collect();
        let plan = session.continue_build(results).unwrap();
        assert_eq!(plan.phase, BuildPhase::ContributeArtifacts);
        assert!(!plan.pending_hooks.is_empty());
        let results: Vec<_> = plan
            .pending_hooks
            .iter()
            .map(|h| PluginResult {
                plugin_id: h.plugin_id.clone(),
                hook: h.hook,
                ok: true,
                patch: None,
                diagnostics: vec![],
                dependencies: vec![],
            })
            .collect();
        let plan = session.continue_build(results).unwrap();
        assert_eq!(plan.phase, BuildPhase::ReadyToCommit);
    }

    #[test]
    fn hook_payloads_carry_site_pages_and_site_summary() {
        let dir = tempfile::tempdir().unwrap();
        write_min_project(dir.path());
        fs::create_dir_all(dir.path().join("content/posts")).unwrap();
        fs::write(
            dir.path().join("content/index.md"),
            "---\ntitle: Home\n---\n\nhome\n",
        )
        .unwrap();
        fs::write(
            dir.path().join("content/posts/2025-08-11-first.md"),
            "---\ntitle: First post\ndate: 2026-08-11\n---\n\npost\n",
        )
        .unwrap();
        fs::write(
            dir.path().join("content/secret.md"),
            "---\ntitle: Secret\ndraft: true\n---\n\nhidden\n",
        )
        .unwrap();
        fs::write(
            dir.path().join("doki.toml"),
            r#"
title = "Session Site"
content_dir = "content"
output_dir = "dist"
incremental = true

[[plugins]]
path = "./plugins/probe"
enabled = true
"#,
        )
        .unwrap();

        let mut session =
            BuildSession::open_project(dir.path(), LoadOptions::default()).unwrap();
        let plan = session.prepare_build(BuildMode::Development).unwrap();
        assert_eq!(plan.phase, BuildPhase::ValidateConfig);

        let plan = advance(&mut session, plan);
        assert_eq!(plan.phase, BuildPhase::TransformContent);
        let input = &plan.pending_hooks[0].input;
        assert!(input.get("contentIds").is_none(), "{input}");
        let pages = input["pages"].as_array().unwrap();
        assert_eq!(pages.len(), 5, "{input}");
        let first = pages
            .iter()
            .find(|page| page["relPath"] == "posts/2025-08-11-first.md")
            .unwrap();
        assert_eq!(first["type"], "post");
        assert_eq!(first["route"], "/posts/first/");
        assert_eq!(first["output"], "pages/posts/2025-08-11-first.html");
        assert_eq!(first["url"], "/pages/posts/2025-08-11-first.html");
        assert_eq!(first["title"], "First post");
        assert_eq!(first["date"], "2026-08-11");
        assert_eq!(first["draft"], false);
        assert_eq!(first["description"], serde_json::Value::Null);
        let home = pages
            .iter()
            .find(|page| page["relPath"] == "index.md")
            .unwrap();
        assert_eq!(home["type"], "home");
        assert_eq!(home["route"], "/");
        let draft = pages
            .iter()
            .find(|page| page["relPath"] == "secret.md")
            .unwrap();
        assert_eq!(draft["draft"], true, "development builds include drafts");

        let plan = advance(&mut session, plan);
        assert_eq!(plan.phase, BuildPhase::ContributeArtifacts);
        let input = &plan.pending_hooks[0].input;
        assert_eq!(input["site"]["title"], "Session Site");
        assert_eq!(input["site"]["lang"], "en");
        assert_eq!(input["site"]["postCount"], 1);
        assert_eq!(input["site"]["baseUrl"], serde_json::Value::Null);
        assert_eq!(input["pages"].as_array().unwrap().len(), 5);
        assert!(input.get("contentIds").is_none(), "{input}");
        let complete = plan
            .pending_hooks
            .iter()
            .find(|hook| hook.hook == HookKind::BuildComplete)
            .unwrap();
        assert_eq!(complete.input["readOnly"], true);
        assert_eq!(complete.input["pages"].as_array().unwrap().len(), 5);
    }

    #[test]
    fn prepare_build_fails_on_route_conflict() {
        let dir = tempfile::tempdir().unwrap();
        write_min_project(dir.path());
        fs::create_dir_all(dir.path().join("content/posts")).unwrap();
        fs::write(
            dir.path().join("content/posts/hello.md"),
            "---\ntitle: Plain\n---\n\nplain\n",
        )
        .unwrap();
        fs::write(
            dir.path().join("content/posts/2025-06-15-hello.md"),
            "---\ntitle: Dated\n---\n\ndated\n",
        )
        .unwrap();

        let mut session =
            BuildSession::open_project(dir.path(), LoadOptions::default()).unwrap();
        let err = session.prepare_build(BuildMode::Production).unwrap_err();
        let message = err.to_string();
        assert!(
            message.contains("doki.site.route-conflict"),
            "diagnostic code must be in the error: {message}"
        );
        assert!(message.contains("posts/hello.md"), "{message}");
        assert!(message.contains("posts/2025-06-15-hello.md"), "{message}");
        assert!(message.contains("/posts/hello/"), "{message}");
        assert!(
            !dir.path().join("dist/pages/posts/hello.html").exists(),
            "a conflicted build must not render"
        );
        assert!(!dir.path().join("dist/pages/posts/2025-06-15-hello.html").exists());
        assert!(session.active.is_none());
    }

    #[test]
    fn build_rewrites_content_links_to_output_permalinks() {
        let dir = tempfile::tempdir().unwrap();
        write_min_project(dir.path());
        fs::write(
            dir.path().join("content/hello.md"),
            "---\ntitle: Hello\n---\n\nsee [About](about/) and [ext](https://example.com/)\n",
        )
        .unwrap();
        let mut session = BuildSession::open_project(dir.path(), LoadOptions::default()).unwrap();
        session.prepare_build(BuildMode::Production).unwrap();
        session.commit_build().unwrap();
        let html = fs::read_to_string(dir.path().join("dist/pages/hello.html")).unwrap();
        assert!(
            html.contains(r#"<a href="/pages/about.html">"#),
            "relative content route should resolve to the built page, got: {html}"
        );
        assert!(html.contains(r#"<a href="https://example.com/">"#));
    }

    #[test]
    fn dispose_blocks_further_builds() {
        let dir = tempfile::tempdir().unwrap();
        write_min_project(dir.path());
        let mut session = BuildSession::open_project(dir.path(), LoadOptions::default()).unwrap();
        session.dispose();
        let err = session.prepare_build(BuildMode::Check).unwrap_err();
        assert!(err.to_string().contains("disposed"));
    }
}
