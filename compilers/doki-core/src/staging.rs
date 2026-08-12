//! Staging directory + atomic-ish promote into `output_dir`.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{CoreError, CoreResult};

#[derive(Debug, Clone)]
pub struct StagingArea {
    pub root: PathBuf,
}

impl StagingArea {
    pub fn create(output_root: &Path, build_id: &str) -> CoreResult<Self> {
        let root = output_root.join(".doki-staging").join(build_id);
        if root.exists() {
            fs::remove_dir_all(&root).map_err(|source| CoreError::Io { source })?;
        }
        fs::create_dir_all(&root).map_err(|source| CoreError::Io { source })?;
        Ok(Self { root })
    }

    pub fn write_file(&self, rel: &str, bytes: impl AsRef<[u8]>) -> CoreResult<()> {
        let rel = rel.replace('\\', "/");
        let dest = self.root.join(&rel);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|source| CoreError::Io { source })?;
        }
        fs::write(dest, bytes).map_err(|source| CoreError::Io { source })?;
        Ok(())
    }

    pub fn discard(self) {
        let _ = fs::remove_dir_all(&self.root);
    }

    /// Promote staging into `output_dir`.
    ///
    /// - Copies every file under staging (preserving relative paths).
    /// - When `replace_set` is `Some`, also deletes those relative paths from
    ///   output that are not present in the new committed set (full rebuild cleanup).
    /// - Staging root is removed on success.
    pub fn commit_into(
        self,
        output_dir: &Path,
        replace_set: Option<&BTreeSet<String>>,
    ) -> CoreResult<Vec<String>> {
        fs::create_dir_all(output_dir).map_err(|source| CoreError::Io { source })?;

        let mut committed = Vec::new();
        copy_tree(&self.root, output_dir, "", &mut committed)?;

        if let Some(previous) = replace_set {
            let new_set: BTreeSet<_> = committed.iter().cloned().collect();
            for old in previous {
                if new_set.contains(old) {
                    continue;
                }
                let path = output_dir.join(old);
                if path.is_file() {
                    let _ = fs::remove_file(path);
                }
            }
        }

        let _ = fs::remove_dir_all(&self.root);
        // Clean empty staging parent when possible.
        let _ = fs::remove_dir(output_dir.join(".doki-staging"));

        committed.sort();
        Ok(committed)
    }
}

fn copy_tree(
    from: &Path,
    to_root: &Path,
    rel: &str,
    committed: &mut Vec<String>,
) -> CoreResult<()> {
    for entry in fs::read_dir(from).map_err(|source| CoreError::Io { source })? {
        let entry = entry.map_err(|source| CoreError::Io { source })?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        let child_rel = if rel.is_empty() {
            name_str.replace('\\', "/")
        } else {
            format!("{rel}/{}", name_str.replace('\\', "/"))
        };
        let src = entry.path();
        let dest = to_root.join(&child_rel);
        if src.is_dir() {
            fs::create_dir_all(&dest).map_err(|source| CoreError::Io { source })?;
            copy_tree(&src, to_root, &child_rel, committed)?;
        } else {
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent).map_err(|source| CoreError::Io { source })?;
            }
            fs::copy(&src, &dest).map_err(|source| CoreError::Io { source })?;
            committed.push(child_rel);
        }
    }
    Ok(())
}
