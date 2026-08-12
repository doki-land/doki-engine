//! In-process session table for the N-API surface.
//!
//! Only opaque string ids cross into JavaScript; plans/results are JSON.

use std::collections::HashMap;
use std::sync::Arc;

use doki_core::{
    BuildMode, BuildSession, FileChange, LoadOptions, PluginResult, ResolvedExtension,
};
use parking_lot::Mutex;
use serde_json::Value;

use crate::error::{NodeError, NodeResult};

#[derive(Default)]
pub struct SessionRegistry {
    sessions: HashMap<String, BuildSession>,
}

impl SessionRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    #[allow(dead_code)]
    pub fn open_project(&mut self, root: &str, allow_local: bool) -> NodeResult<String> {
        self.open_project_with_options(root, allow_local, None)
    }

    pub fn open_project_with_options(
        &mut self,
        root: &str,
        allow_local: bool,
        theme_defaults: Option<String>,
    ) -> NodeResult<String> {
        let session = BuildSession::open_project(
            root,
            LoadOptions {
                allow_local,
                theme_defaults: theme_defaults.map(std::path::PathBuf::from),
            },
        )
        .map_err(NodeError::from_core)?;
        let id = session.id.clone();
        self.sessions.insert(id.clone(), session);
        Ok(id)
    }

    pub fn prepare_build(&mut self, session_id: &str, mode: &str) -> NodeResult<Value> {
        let mode = parse_mode(mode)?;
        let session = self.get_mut(session_id)?;
        let plan = session
            .prepare_build(mode)
            .map_err(NodeError::from_core)?;
        Ok(serde_json::to_value(plan).expect("plan serialize"))
    }

    pub fn continue_build(&mut self, session_id: &str, results: Value) -> NodeResult<Value> {
        let results: Vec<PluginResult> = serde_json::from_value(results)
            .map_err(|e| NodeError::invalid(format!("plugin results: {e}")))?;
        let session = self.get_mut(session_id)?;
        let plan = session
            .continue_build(results)
            .map_err(NodeError::from_core)?;
        Ok(serde_json::to_value(plan).expect("plan serialize"))
    }

    pub fn commit_build(&mut self, session_id: &str) -> NodeResult<Value> {
        let session = self.get_mut(session_id)?;
        let result = session.commit_build().map_err(NodeError::from_core)?;
        Ok(serde_json::to_value(result).expect("result serialize"))
    }

    pub fn invalidate(&mut self, session_id: &str, changes: Value) -> NodeResult<Value> {
        let changes: Vec<FileChange> = serde_json::from_value(changes)
            .map_err(|e| NodeError::invalid(format!("file changes: {e}")))?;
        let session = self.get_mut(session_id)?;
        let result = session
            .invalidate(&changes)
            .map_err(NodeError::from_core)?;
        Ok(serde_json::to_value(result).expect("invalidate serialize"))
    }

    pub fn cancel(&mut self, session_id: &str) -> NodeResult<()> {
        let session = self.get_mut(session_id)?;
        session.cancel().map_err(NodeError::from_core)
    }

    pub fn dispose(&mut self, session_id: &str) -> NodeResult<()> {
        let Some(mut session) = self.sessions.remove(session_id) else {
            return Err(NodeError::invalid(format!(
                "unknown session `{session_id}`"
            )));
        };
        session.dispose();
        Ok(())
    }

    pub fn inspect(&self, session_id: &str) -> NodeResult<Value> {
        let session = self.get(session_id)?;
        Ok(serde_json::json!({
            "sessionId": session.id,
            "root": session.project_root().to_string_lossy(),
            "title": session.config().title,
            "lang": session.config().lang,
            "contentDir": session.config().content_dir,
            "outputDir": session.config().output_dir,
            "contentCount": session.graph().len(),
            "extensions": session.extensions(),
            "overrides": session.config().overrides,
            "incremental": session.config().incremental,
            "disposed": session.is_disposed(),
        }))
    }

    pub fn set_resolved_extensions(
        &mut self,
        session_id: &str,
        extensions: Value,
    ) -> NodeResult<()> {
        let extensions: Vec<ResolvedExtension> = serde_json::from_value(extensions)
            .map_err(|e| NodeError::invalid(format!("extensions: {e}")))?;
        let session = self.get_mut(session_id)?;
        session
            .set_resolved_extensions(extensions)
            .map_err(NodeError::from_core)
    }

    pub fn explain_rebuild(&mut self, session_id: &str, path: &str) -> NodeResult<Value> {
        let session = self.get_mut(session_id)?;
        let result = session
            .explain_rebuild(path)
            .map_err(NodeError::from_core)?;
        Ok(serde_json::to_value(result).expect("explain serialize"))
    }

    fn get(&self, session_id: &str) -> NodeResult<&BuildSession> {
        self.sessions.get(session_id).ok_or_else(|| {
            NodeError::invalid(format!("unknown session `{session_id}`"))
        })
    }

    fn get_mut(&mut self, session_id: &str) -> NodeResult<&mut BuildSession> {
        self.sessions.get_mut(session_id).ok_or_else(|| {
            NodeError::invalid(format!("unknown session `{session_id}`"))
        })
    }
}

fn parse_mode(mode: &str) -> NodeResult<BuildMode> {
    match mode {
        "development" | "dev" => Ok(BuildMode::Development),
        "production" | "prod" => Ok(BuildMode::Production),
        "check" => Ok(BuildMode::Check),
        other => Err(NodeError::invalid(format!(
            "unknown build mode `{other}` (use development|production|check)"
        ))),
    }
}

pub type SharedRegistry = Arc<Mutex<SessionRegistry>>;

pub fn shared_registry() -> SharedRegistry {
    Arc::new(Mutex::new(SessionRegistry::new()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write_site(dir: &std::path::Path) {
        fs::write(
            dir.join("doki.toml"),
            r#"
title = "Napi Site"
content_dir = "content"
output_dir = "dist"
"#,
        )
        .unwrap();
        fs::create_dir_all(dir.join("content")).unwrap();
        fs::write(
            dir.join("content/hi.md"),
            "---\ntitle: Hi\n---\n\n# Hi\n",
        )
        .unwrap();
    }

    #[test]
    fn open_prepare_commit_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        write_site(dir.path());
        let mut reg = SessionRegistry::new();
        let id = reg
            .open_project(dir.path().to_str().unwrap(), false)
            .unwrap();
        let plan = reg.prepare_build(&id, "production").unwrap();
        assert_eq!(plan["phase"], "readyToCommit");
        let result = reg.commit_build(&id).unwrap();
        assert!(result["committedFiles"]
            .as_array()
            .unwrap()
            .iter()
            .any(|f| f.as_str() == Some("doki-manifest.json")));
        assert!(result["committedFiles"]
            .as_array()
            .unwrap()
            .iter()
            .any(|f| f.as_str() == Some(".doki/build-manifest.json")));
        assert!(dir.path().join("dist/pages/hi.html").is_file());
        assert!(dir
            .path()
            .join("dist/.doki/build-manifest.json")
            .is_file());
        reg.dispose(&id).unwrap();
        assert!(reg.inspect(&id).is_err());
    }
}
