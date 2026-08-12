use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{CoreError, CoreResult};
use crate::frontmatter::{parse_document, FrontMatter};

/// Stable content identity within a project (POSIX-ish relative path from content root).
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct ContentId(pub String);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentNode {
    pub id: ContentId,
    /// Absolute path on disk.
    pub path: PathBuf,
    /// Relative path from `content_dir`.
    pub rel_path: String,
    pub kind: ContentKind,
    pub front_matter: FrontMatterDto,
    /// Markdown body without front matter.
    pub body: String,
    /// Hex SHA-256 of the raw file bytes.
    pub content_hash: String,
}

/// Wire-friendly front matter subset (keeps full `fields` for plugins later).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontMatterDto {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    #[serde(default)]
    pub draft: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weight: Option<i64>,
    #[serde(default, skip_serializing_if = "serde_json::Map::is_empty")]
    pub fields: serde_json::Map<String, serde_json::Value>,
}

impl From<FrontMatter> for FrontMatterDto {
    fn from(fm: FrontMatter) -> Self {
        Self {
            title: fm.title,
            description: fm.description,
            layout: fm.layout,
            date: fm.date,
            draft: fm.draft,
            weight: fm.weight,
            fields: fm.fields,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ContentKind {
    Markdown,
    Other,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentGraph {
    pub nodes: BTreeMap<ContentId, ContentNode>,
    /// id → dependency ids (templates/assets filled later).
    pub edges: BTreeMap<ContentId, BTreeSet<ContentId>>,
}

impl ContentGraph {
    pub fn insert(&mut self, node: ContentNode) {
        self.nodes.insert(node.id.clone(), node);
    }

    pub fn remove(&mut self, id: &ContentId) -> Option<ContentNode> {
        self.edges.remove(id);
        for deps in self.edges.values_mut() {
            deps.remove(id);
        }
        self.nodes.remove(id)
    }

    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }

    /// Dependents that list `id` as an edge target, plus `id` itself.
    pub fn invalidate_closure(&self, id: &ContentId) -> BTreeSet<ContentId> {
        let mut out = BTreeSet::new();
        out.insert(id.clone());
        for (from, tos) in &self.edges {
            if tos.contains(id) {
                out.insert(from.clone());
            }
        }
        out
    }
}

/// Scan `content_dir` and parse Markdown + front matter.
pub fn discover_markdown_content(
    project_root: &Path,
    content_dir: &str,
) -> CoreResult<ContentGraph> {
    let root = project_root.join(content_dir);
    let mut graph = ContentGraph::default();
    if !root.exists() {
        return Ok(graph);
    }
    walk_md(&root, &root, &mut graph)?;
    Ok(graph)
}

pub fn load_markdown_node(content_root: &Path, abs_path: &Path) -> CoreResult<ContentNode> {
    let rel = abs_path
        .strip_prefix(content_root)
        .unwrap_or(abs_path)
        .to_string_lossy()
        .replace('\\', "/");
    let raw = std::fs::read(abs_path).map_err(|source| CoreError::Io { source })?;
    let content_hash = hex::encode(Sha256::digest(&raw));
    let source = String::from_utf8_lossy(&raw);
    let doc = parse_document(&source)?;
    Ok(ContentNode {
        id: ContentId(rel.clone()),
        path: abs_path.to_path_buf(),
        rel_path: rel,
        kind: ContentKind::Markdown,
        front_matter: FrontMatterDto::from(doc.front_matter),
        body: doc.body,
        content_hash,
    })
}

fn walk_md(dir: &Path, content_root: &Path, graph: &mut ContentGraph) -> CoreResult<()> {
    let entries = std::fs::read_dir(dir).map_err(|source| CoreError::Io { source })?;
    for entry in entries {
        let entry = entry.map_err(|source| CoreError::Io { source })?;
        let path = entry.path();
        if path.is_dir() {
            walk_md(&path, content_root, graph)?;
            continue;
        }
        let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        if !matches!(ext, "md" | "mdx" | "markdown") {
            continue;
        }
        let node = load_markdown_node(content_root, &path)?;
        graph.insert(node);
    }
    Ok(())
}

/// Output-relative HTML path for a content node (`pages/posts/a.html`).
pub fn staging_page_rel(node: &ContentNode) -> String {
    let without_ext = node
        .rel_path
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(node.rel_path.as_str());
    format!("pages/{without_ext}.html")
}
