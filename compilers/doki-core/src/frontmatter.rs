//! Front matter split for Markdown sources (`---` YAML or `+++` TOML).

use serde_json::{Map, Value};

use crate::error::{CoreError, CoreResult};

/// Parsed page metadata + remaining Markdown body.
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedDocument {
    pub front_matter: FrontMatter,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct FrontMatter {
    pub title: Option<String>,
    pub description: Option<String>,
    /// Front matter `type` (`home` / `post` / `page`), validated by the site model.
    pub page_type: Option<String>,
    pub layout: Option<String>,
    pub date: Option<String>,
    pub draft: bool,
    pub weight: Option<i64>,
    /// Full table as JSON for plugin / template context later.
    pub fields: Map<String, Value>,
}

impl FrontMatter {
    pub fn from_map(fields: Map<String, Value>) -> Self {
        let title = string_field(&fields, "title");
        let description = string_field(&fields, "description");
        let page_type = string_field(&fields, "type");
        let layout = string_field(&fields, "layout");
        let date = string_field(&fields, "date");
        let draft = bool_field(&fields, "draft").unwrap_or(false);
        let weight = i64_field(&fields, "weight");
        Self {
            title,
            description,
            page_type,
            layout,
            date,
            draft,
            weight,
            fields,
        }
    }
}

/// Split optional front matter from Markdown source.
pub fn parse_document(source: &str) -> CoreResult<ParsedDocument> {
    let trimmed = strip_bom(source);
    if let Some(doc) = try_delimited(trimmed, "---")? {
        return Ok(doc);
    }
    if let Some(doc) = try_delimited(trimmed, "+++")? {
        return Ok(doc);
    }
    Ok(ParsedDocument {
        front_matter: FrontMatter::default(),
        body: trimmed.to_string(),
    })
}

fn try_delimited(source: &str, fence: &str) -> CoreResult<Option<ParsedDocument>> {
    let first = source.lines().next().unwrap_or("").trim_end_matches('\r');
    if first != fence {
        return Ok(None);
    }
    let rest = match source.find('\n') {
        Some(i) => &source[i + 1..],
        None => return Ok(None),
    };
    let close = format!("\n{fence}");
    let Some(end) = rest.find(&close) else {
        return Err(CoreError::build(format!(
            "unclosed front matter delimiter `{fence}`"
        )));
    };
    let matter = &rest[..end];
    let after = &rest[end + close.len()..];
    let body = after.strip_prefix('\n').unwrap_or(after).to_string();
    let fields = if fence == "---" {
        parse_yaml_map(matter)?
    } else {
        parse_toml_map(matter)?
    };
    Ok(Some(ParsedDocument {
        front_matter: FrontMatter::from_map(fields),
        body,
    }))
}

fn parse_yaml_map(matter: &str) -> CoreResult<Map<String, Value>> {
    if matter.trim().is_empty() {
        return Ok(Map::new());
    }
    let value: Value = serde_yaml::from_str(matter).map_err(|e| {
        CoreError::build(format!("invalid YAML front matter: {e}"))
    })?;
    match value {
        Value::Object(map) => Ok(map),
        Value::Null => Ok(Map::new()),
        other => Err(CoreError::build(format!(
            "front matter must be a mapping, got {other}"
        ))),
    }
}

fn parse_toml_map(matter: &str) -> CoreResult<Map<String, Value>> {
    if matter.trim().is_empty() {
        return Ok(Map::new());
    }
    let table: toml::Table = matter
        .parse()
        .map_err(|e| CoreError::build(format!("invalid TOML front matter: {e}")))?;
    let value = serde_json::to_value(table).map_err(|e| {
        CoreError::build(format!("toml front matter to json failed: {e}"))
    })?;
    match value {
        Value::Object(map) => Ok(map),
        other => Err(CoreError::build(format!(
            "front matter must be a mapping, got {other}"
        ))),
    }
}

fn strip_bom(s: &str) -> &str {
    s.strip_prefix('\u{feff}').unwrap_or(s)
}

fn string_field(fields: &Map<String, Value>, key: &str) -> Option<String> {
    match fields.get(key)? {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

fn bool_field(fields: &Map<String, Value>, key: &str) -> Option<bool> {
    match fields.get(key)? {
        Value::Bool(b) => Some(*b),
        Value::String(s) => match s.as_str() {
            "true" | "True" | "yes" | "1" => Some(true),
            "false" | "False" | "no" | "0" => Some(false),
            _ => None,
        },
        _ => None,
    }
}

fn i64_field(fields: &Map<String, Value>, key: &str) -> Option<i64> {
    match fields.get(key)? {
        Value::Number(n) => n.as_i64(),
        Value::String(s) => s.parse().ok(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_yaml_front_matter() {
        let doc = parse_document(
            "---\ntitle: Hello\ntype: page\ndraft: true\nweight: 3\n---\n\n# Body\n",
        )
        .unwrap();
        assert_eq!(doc.front_matter.title.as_deref(), Some("Hello"));
        assert_eq!(doc.front_matter.page_type.as_deref(), Some("page"));
        assert!(doc.front_matter.draft);
        assert_eq!(doc.front_matter.weight, Some(3));
        assert!(doc.body.contains("# Body"));
    }

    #[test]
    fn parses_toml_front_matter() {
        let doc = parse_document("+++\ntitle = \"Tom\"\ndraft = false\n+++\nHi\n").unwrap();
        assert_eq!(doc.front_matter.title.as_deref(), Some("Tom"));
        assert!(!doc.front_matter.draft);
        assert_eq!(doc.body.trim(), "Hi");
    }

    #[test]
    fn no_front_matter_keeps_body() {
        let doc = parse_document("# Just md\n").unwrap();
        assert!(doc.front_matter.title.is_none());
        assert_eq!(doc.body, "# Just md\n");
    }
}
