//! N-API surface for doki-core.
//!
//! Coarse session API only — no Dejavu objects, builder handles, or OXC.

#![deny(clippy::all)]

mod error;
mod registry;

use std::sync::OnceLock;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde_json::Value;

use crate::error::NodeError;
use crate::registry::{shared_registry, SharedRegistry};

fn registry() -> &'static SharedRegistry {
    static REG: OnceLock<SharedRegistry> = OnceLock::new();
    REG.get_or_init(shared_registry)
}

/// Open a project root; returns an opaque session id.
///
/// `themeDefaults` is an absolute path to a theme `doki.defaults.toml` after Node
/// resolves a `package` theme (path themes are auto-loaded by the core).
#[napi]
pub fn open_project(
    root: String,
    allow_local: Option<bool>,
    theme_defaults: Option<String>,
) -> Result<String> {
    registry()
        .lock()
        .open_project_with_options(
            &root,
            allow_local.unwrap_or(false),
            theme_defaults,
        )
        .map_err(Into::into)
}

/// Peek theme declaration from doki.toml (JSON: `{ path?, package? }` or null).
#[napi]
pub fn peek_theme(root: String) -> Result<Value> {
    let theme = doki_core::peek_theme_ref(&root)
        .map_err(|e| NodeError::invalid(e.to_string()))?;
    Ok(serde_json::to_value(theme).expect("theme serialize"))
}

/// Return the theme defaults file under `themeRoot`, if any.
#[napi]
pub fn find_theme_defaults(theme_root: String) -> Result<Option<String>> {
    Ok(
        doki_core::theme_defaults_file(&theme_root).map(|p| p.to_string_lossy().into_owned()),
    )
}

/// Start a segmented build (`development` | `production` | `check`).
#[napi]
pub fn prepare_build(session_id: String, mode: String) -> Result<Value> {
    registry()
        .lock()
        .prepare_build(&session_id, &mode)
        .map_err(Into::into)
}

/// Apply one plugin-result batch and advance the plan.
#[napi]
pub fn continue_build(session_id: String, results: Value) -> Result<Value> {
    registry()
        .lock()
        .continue_build(&session_id, results)
        .map_err(Into::into)
}

/// Atomically promote staging into the output directory.
#[napi]
pub fn commit_build(session_id: String) -> Result<Value> {
    registry()
        .lock()
        .commit_build(&session_id)
        .map_err(Into::into)
}

/// Apply filesystem changes to the content graph.
#[napi]
pub fn invalidate(session_id: String, changes: Value) -> Result<Value> {
    registry()
        .lock()
        .invalidate(&session_id, changes)
        .map_err(Into::into)
}

/// Cancel the active build (if any).
#[napi]
pub fn cancel(session_id: String) -> Result<()> {
    registry().lock().cancel(&session_id).map_err(Into::into)
}

/// Dispose the session and drop its state.
#[napi]
pub fn dispose(session_id: String) -> Result<()> {
    registry().lock().dispose(&session_id).map_err(Into::into)
}

/// Read-only session snapshot (JSON).
#[napi]
pub fn inspect(session_id: String) -> Result<Value> {
    registry().lock().inspect(&session_id).map_err(Into::into)
}

/// Push Node-resolved extension absolute paths into the session.
#[napi]
pub fn set_resolved_extensions(session_id: String, extensions: Value) -> Result<()> {
    registry()
        .lock()
        .set_resolved_extensions(&session_id, extensions)
        .map_err(Into::into)
}

/// Explain whether modifying `path` (project-relative) would rebuild.
#[napi]
pub fn explain_rebuild(session_id: String, path: String) -> Result<Value> {
    registry()
        .lock()
        .explain_rebuild(&session_id, &path)
        .map_err(Into::into)
}
