//! Internationalization kernel: `locales/<locale>.json5` catalogs, explicit
//! fallback chains, message lookup with named-argument interpolation and
//! structured `doki.i18n.*` diagnostics.
//!
//! The catalog authoring format is JSON5 (line/block comments, trailing
//! commas, unquoted keys, single-quoted strings, hex and leading-dot numbers).
//! Parsing lives in this build layer only — the Dejavu engine never touches
//! the filesystem. Nested objects flatten to dot-separated message keys;
//! `t`/`locale` reach templates through the Dejavu host registry in `render`.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

use crate::config::ProjectConfig;
use crate::diagnostic::Diagnostic;

/// Explicit fallback chain contains a cycle (`[i18n.fallback]`).
pub const FALLBACK_CYCLE_CODE: &str = "doki.i18n.fallback-cycle";
/// The same message key appears twice inside one catalog object.
pub const DUPLICATE_KEY_CODE: &str = "doki.i18n.duplicate-key";
/// A `t` lookup found no string message anywhere in the fallback chain.
pub const MISSING_KEY_CODE: &str = "doki.i18n.missing-key";
/// JSON5 syntax error in a catalog file.
pub const CATALOG_SYNTAX_CODE: &str = "doki.i18n.catalog-syntax";
/// An enabled locale has no `locales/<locale>.json5` file.
pub const MISSING_CATALOG_CODE: &str = "doki.i18n.missing-catalog";
/// A catalog file could not be read.
pub const CATALOG_IO_CODE: &str = "doki.i18n.catalog-io";

/// BCP-47 style locale id: alphanumeric subtags joined by single hyphens.
/// Rejects empty strings, path separators and traversal before any IO.
pub(crate) fn is_valid_locale_id(value: &str) -> bool {
    !value.is_empty()
        && !value.contains('/')
        && !value.contains('\\')
        && value.split('-').all(|part| {
            !part.is_empty() && part.chars().all(|c| c.is_ascii_alphanumeric())
        })
}

// ---------------------------------------------------------------------------
// Loaded catalog state
// ---------------------------------------------------------------------------

/// All message catalogs for one build, with the fallback chain resolved.
#[derive(Debug, Clone)]
pub struct I18n {
    default_locale: String,
    locales: Vec<String>,
    fallback: BTreeMap<String, String>,
    catalogs: BTreeMap<String, BTreeMap<String, Value>>,
    catalog_hashes: BTreeMap<String, String>,
}

impl I18n {
    /// Load enabled locale catalogs from `<project_root>/locales/*.json5`.
    ///
    /// Returns the resolved state plus structured diagnostics. Error codes
    /// (`catalog-syntax`, `duplicate-key`, `fallback-cycle`, `catalog-io`)
    /// abort the build; warnings (`missing-catalog`) do not.
    pub fn load(project_root: &Path, config: &ProjectConfig) -> (I18n, Vec<Diagnostic>) {
        let mut diagnostics = Vec::new();
        let default_locale = config.lang.clone();
        let (locales, fallback) = match &config.i18n {
            Some(i) => (i.locales.clone(), i.fallback.clone()),
            None => (vec![default_locale.clone()], BTreeMap::new()),
        };

        // Explicit fallback chains must terminate at `lang`; a cycle is fatal.
        let mut reported: BTreeSet<String> = BTreeSet::new();
        for start in &locales {
            let mut seen: Vec<String> = Vec::new();
            let mut cur = start.clone();
            loop {
                if cur == default_locale {
                    break;
                }
                if let Some(idx) = seen.iter().position(|s| *s == cur) {
                    let cycle: Vec<&str> = seen[idx..]
                        .iter()
                        .map(String::as_str)
                        .chain(std::iter::once(cur.as_str()))
                        .collect();
                    let key = cycle.join(" -> ");
                    if reported.insert(key.clone()) {
                        diagnostics.push(Diagnostic::error(
                            FALLBACK_CYCLE_CODE,
                            format!("`[i18n.fallback]` forms a cycle: {key}"),
                        ));
                    }
                    break;
                }
                seen.push(cur.clone());
                match fallback.get(&cur) {
                    Some(parent) => cur = parent.clone(),
                    None => break,
                }
            }
        }

        let locales_dir = project_root.join("locales");
        let dir_exists = locales_dir.is_dir();
        let mut catalogs: BTreeMap<String, BTreeMap<String, Value>> = BTreeMap::new();
        let mut catalog_hashes = BTreeMap::new();

        for locale in &locales {
            let rel = format!("locales/{locale}.json5");
            let path = locales_dir.join(format!("{locale}.json5"));
            if !path.is_file() {
                if dir_exists {
                    let mut d = Diagnostic::warning(
                        MISSING_CATALOG_CODE,
                        format!("locale `{locale}` is enabled but has no catalog at `{rel}`"),
                    );
                    d.file = Some(rel.clone());
                    diagnostics.push(d);
                }
                continue;
            }
            let bytes = match std::fs::read(&path) {
                Ok(bytes) => bytes,
                Err(e) => {
                    let mut d = Diagnostic::error(
                        CATALOG_IO_CODE,
                        format!("cannot read `{rel}`: {e}"),
                    );
                    d.file = Some(rel.clone());
                    diagnostics.push(d);
                    continue;
                }
            };
            let hash = hex::encode(Sha256::digest(&bytes));
            let text = match std::str::from_utf8(&bytes) {
                Ok(text) => text,
                Err(e) => {
                    let mut d = Diagnostic::error(
                        CATALOG_SYNTAX_CODE,
                        format!("`{rel}` is not valid UTF-8: {e}"),
                    );
                    d.file = Some(rel.clone());
                    diagnostics.push(d);
                    continue;
                }
            };
            match parse_json5(text) {
                Ok((value, issues)) => {
                    if !value.is_object() {
                        let mut d = Diagnostic::error(
                            CATALOG_SYNTAX_CODE,
                            format!("`{rel}` must be a JSON5 object at the top level"),
                        );
                        d.file = Some(rel.clone());
                        diagnostics.push(d);
                        continue;
                    }
                    for issue in issues {
                        let mut d = Diagnostic::error(
                            DUPLICATE_KEY_CODE,
                            format!(
                                "duplicate key `{}` in `{rel}` (line {}, column {})",
                                issue.key.clone().unwrap_or_default(),
                                issue.line,
                                issue.column
                            ),
                        );
                        d.file = Some(rel.clone());
                        diagnostics.push(d);
                    }
                    let mut flat = BTreeMap::new();
                    flatten_into("", value, &mut flat);
                    catalogs.insert(locale.clone(), flat);
                    catalog_hashes.insert(locale.clone(), hash);
                }
                Err(issue) => {
                    let mut d = Diagnostic::error(
                        CATALOG_SYNTAX_CODE,
                        format!(
                            "JSON5 syntax error in `{rel}`: {} (line {}, column {})",
                            issue.message, issue.line, issue.column
                        ),
                    );
                    d.file = Some(rel.clone());
                    diagnostics.push(d);
                }
            }
        }

        let i18n = I18n {
            default_locale,
            locales,
            fallback,
            catalogs,
            catalog_hashes,
        };
        (i18n, diagnostics)
    }

    pub fn default_locale(&self) -> &str {
        &self.default_locale
    }

    pub fn locales(&self) -> &[String] {
        &self.locales
    }

    pub fn is_multi(&self) -> bool {
        self.locales.len() > 1
    }

    pub fn hashes(&self) -> &BTreeMap<String, String> {
        &self.catalog_hashes
    }

    pub fn catalog(&self, locale: &str) -> Option<&BTreeMap<String, Value>> {
        self.catalogs.get(locale)
    }

    /// Lookup chain for `locale`: itself, explicit parents, then `lang` tail.
    pub fn chain(&self, locale: &str) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        let mut cur = locale.to_string();
        let mut guard = 0usize;
        while guard < 64 {
            guard += 1;
            if out.contains(&cur) {
                break;
            }
            out.push(cur.clone());
            if cur == self.default_locale {
                return out;
            }
            match self.fallback.get(&cur) {
                Some(parent) => cur = parent.clone(),
                None => break,
            }
        }
        if !out.contains(&self.default_locale) {
            out.push(self.default_locale.clone());
        }
        out
    }

    /// Resolve `key` for `locale` along the fallback chain and interpolate
    /// `{name}` placeholders from `args`. On a miss the key literal is
    /// returned plus a `missing-key` Warning diagnostic.
    pub fn translate(
        &self,
        locale: &str,
        key: &str,
        args: Option<&Map<String, Value>>,
    ) -> (String, Option<Diagnostic>) {
        let chain = self.chain(locale);
        for loc in &chain {
            let Some(cat) = self.catalogs.get(loc) else {
                continue;
            };
            let Some(value) = cat.get(key) else {
                continue;
            };
            return match value {
                Value::String(template) => (interpolate(template, args), None),
                other => {
                    // Non-string leaves (plural/select objects) are not a
                    // delivered message form yet; report and fall back to key.
                    let mut d = Diagnostic::warning(
                        MISSING_KEY_CODE,
                        format!(
                            "key `{key}` in locale `{loc}` is not a string message ({kind}); plural/select catalogs are not delivered yet",
                            kind = json_type(other)
                        ),
                    );
                    d.file = Some(format!("locales/{loc}.json5"));
                    (key.to_string(), Some(d))
                }
            };
        }
        let d = Diagnostic::warning(
            MISSING_KEY_CODE,
            format!(
                "missing message key `{key}` for locale `{locale}` (tried: {})",
                chain.join(" -> ")
            ),
        );
        (key.to_string(), Some(d))
    }
}

fn json_type(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

/// Flatten nested objects into dot-separated message keys.
fn flatten_into(prefix: &str, value: Value, out: &mut BTreeMap<String, Value>) {
    match value {
        Value::Object(map) => {
            for (k, v) in map {
                let key = if prefix.is_empty() {
                    k.clone()
                } else {
                    format!("{prefix}.{k}")
                };
                flatten_into(&key, v, out);
            }
        }
        other => {
            out.insert(prefix.to_string(), other);
        }
    }
}

/// Replace `{name}` placeholders with `args[name]`; unknown names stay literal.
fn interpolate(template: &str, args: Option<&Map<String, Value>>) -> String {
    let mut out = String::with_capacity(template.len());
    let bytes = template.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'{' {
            if let Some(end) = template[i + 1..].find('}') {
                let name = &template[i + 1..i + 1 + end];
                let valid = !name.is_empty()
                    && name
                        .chars()
                        .all(|c| c.is_alphanumeric() || c == '_' || c == '.');
                if valid {
                    if let Some(args) = args {
                        if let Some(v) = args.get(name) {
                            out.push_str(&value_to_string(v));
                            i += 1 + end + 1;
                            continue;
                        }
                    }
                    // Unknown placeholder: keep the literal `{name}`.
                    out.push_str(&template[i..i + 1 + end + 1]);
                    i += 1 + end + 1;
                    continue;
                }
            }
        }
        let ch = template[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn value_to_string(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Minimal JSON5 reader
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Json5IssueKind {
    Syntax,
    DuplicateKey,
}

#[derive(Debug, Clone, PartialEq)]
struct Json5Issue {
    message: String,
    line: usize,
    column: usize,
    kind: Json5IssueKind,
    key: Option<String>,
}

struct Json5Parser {
    chars: Vec<char>,
    pos: usize,
    line: usize,
    col: usize,
    issues: Vec<Json5Issue>,
}

impl Json5Parser {
    fn new(text: &str) -> Self {
        Self {
            chars: text.chars().collect(),
            pos: 0,
            line: 1,
            col: 1,
            issues: Vec::new(),
        }
    }

    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    fn peek_at(&self, n: usize) -> Option<char> {
        self.chars.get(self.pos + n).copied()
    }

    fn at_end(&self) -> bool {
        self.pos >= self.chars.len()
    }

    fn advance(&mut self) -> char {
        let c = self.chars[self.pos];
        self.pos += 1;
        if c == '\n' {
            self.line += 1;
            self.col = 1;
        } else {
            self.col += 1;
        }
        c
    }

    fn error(&self, message: impl Into<String>) -> Json5Issue {
        Json5Issue {
            message: message.into(),
            line: self.line,
            column: self.col,
            kind: Json5IssueKind::Syntax,
            key: None,
        }
    }

    fn eat(&mut self, c: char) -> Result<(), Json5Issue> {
        if self.peek() == Some(c) {
            self.advance();
            Ok(())
        } else {
            Err(self.error(format!("expected `{c}`")))
        }
    }

    fn skip_trivia(&mut self) -> Result<(), Json5Issue> {
        loop {
            match self.peek() {
                Some(c) if c.is_whitespace() => {
                    self.advance();
                }
                Some('/') if self.peek_at(1) == Some('/') => {
                    while !self.at_end() && self.peek() != Some('\n') {
                        self.advance();
                    }
                }
                Some('/') if self.peek_at(1) == Some('*') => {
                    self.advance();
                    self.advance();
                    loop {
                        match self.peek() {
                            None => return Err(self.error("unterminated block comment")),
                            Some('*') if self.peek_at(1) == Some('/') => {
                                self.advance();
                                self.advance();
                                break;
                            }
                            Some(_) => {
                                self.advance();
                            }
                        }
                    }
                }
                _ => break,
            }
        }
        Ok(())
    }

    fn parse_value(&mut self, base: &str) -> Result<Value, Json5Issue> {
        self.skip_trivia()?;
        match self.peek() {
            Some('{') => self.parse_object(base),
            Some('[') => self.parse_array(base),
            Some('"') | Some('\'') => Ok(Value::String(self.parse_string()?)),
            Some(c) if c == '+' || c == '-' || c == '.' || c.is_ascii_digit() => {
                self.parse_number()
            }
            Some(_) => {
                let id = self.parse_identifier();
                match id.as_str() {
                    "true" => Ok(Value::Bool(true)),
                    "false" => Ok(Value::Bool(false)),
                    "null" => Ok(Value::Null),
                    "Infinity" | "NaN" => Err(self
                        .error("Infinity and NaN are not allowed in message catalogs")),
                    _ => Err(self.error(format!("unexpected token `{id}`; expected a value"))),
                }
            }
            None => Err(self.error("unexpected end of input")),
        }
    }

    fn parse_object(&mut self, base: &str) -> Result<Value, Json5Issue> {
        self.eat('{')?;
        let mut map = Map::new();
        loop {
            self.skip_trivia()?;
            if self.peek() == Some('}') {
                self.advance();
                break;
            }
            let key = match self.peek() {
                Some('"') | Some('\'') => self.parse_string()?,
                Some(c) if c.is_alphabetic() || c == '_' || c == '$' => self.parse_identifier(),
                _ => return Err(self.error("expected an object key")),
            };
            self.skip_trivia()?;
            self.eat(':')?;
            let full = if base.is_empty() {
                key.clone()
            } else {
                format!("{base}.{key}")
            };
            let value = self.parse_value(&full)?;
            if map.contains_key(&key) {
                self.issues.push(Json5Issue {
                    message: format!("duplicate key `{full}`"),
                    line: self.line,
                    column: self.col,
                    kind: Json5IssueKind::DuplicateKey,
                    key: Some(full),
                });
            }
            map.insert(key, value);
            self.skip_trivia()?;
            match self.peek() {
                Some(',') => {
                    self.advance();
                }
                Some('}') => {
                    self.advance();
                    break;
                }
                _ => return Err(self.error("expected `,` or `}` in object")),
            }
        }
        Ok(Value::Object(map))
    }

    fn parse_array(&mut self, base: &str) -> Result<Value, Json5Issue> {
        self.eat('[')?;
        let mut items = Vec::new();
        loop {
            self.skip_trivia()?;
            if self.peek() == Some(']') {
                self.advance();
                break;
            }
            let value = self.parse_value(base)?;
            items.push(value);
            self.skip_trivia()?;
            match self.peek() {
                Some(',') => {
                    self.advance();
                }
                Some(']') => {
                    self.advance();
                    break;
                }
                _ => return Err(self.error("expected `,` or `]` in array")),
            }
        }
        Ok(Value::Array(items))
    }

    fn parse_string(&mut self) -> Result<String, Json5Issue> {
        let quote = self.advance();
        let mut out = String::new();
        loop {
            match self.peek() {
                None => return Err(self.error("unterminated string")),
                Some(c) if c == quote => {
                    self.advance();
                    break;
                }
                Some('\n') => return Err(self.error("unterminated string (newline)")),
                Some('\\') => {
                    self.advance();
                    let e = self.peek().ok_or_else(|| self.error("unterminated escape"))?;
                    match e {
                        'n' => {
                            out.push('\n');
                            self.advance();
                        }
                        't' => {
                            out.push('\t');
                            self.advance();
                        }
                        'r' => {
                            out.push('\r');
                            self.advance();
                        }
                        'b' => {
                            out.push('\u{08}');
                            self.advance();
                        }
                        'f' => {
                            out.push('\u{0C}');
                            self.advance();
                        }
                        'v' => {
                            out.push('\u{0B}');
                            self.advance();
                        }
                        '0' => {
                            out.push('\0');
                            self.advance();
                        }
                        '\n' => {
                            self.advance();
                        }
                        '\r' => {
                            self.advance();
                            if self.peek() == Some('\n') {
                                self.advance();
                            }
                        }
                        'x' => {
                            self.advance();
                            let v = self.read_hex(2)?;
                            out.push(
                                char::from_u32(v).ok_or_else(|| self.error("invalid \\x escape"))?,
                            );
                        }
                        'u' => {
                            self.advance();
                            let hi = self.read_hex(4)?;
                            if (0xD800..=0xDBFF).contains(&hi) {
                                if self.peek() == Some('\\') && self.peek_at(1) == Some('u') {
                                    self.advance();
                                    self.advance();
                                    let lo = self.read_hex(4)?;
                                    if (0xDC00..=0xDFFF).contains(&lo) {
                                        let cp =
                                            0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00);
                                        out.push(
                                            char::from_u32(cp)
                                                .ok_or_else(|| self.error("invalid surrogate pair"))?,
                                        );
                                    } else {
                                        return Err(self.error("invalid surrogate pair"));
                                    }
                                } else {
                                    return Err(self.error("lone high surrogate"));
                                }
                            } else if (0xDC00..=0xDFFF).contains(&hi) {
                                return Err(self.error("lone low surrogate"));
                            } else {
                                out.push(
                                    char::from_u32(hi)
                                        .ok_or_else(|| self.error("invalid \\u escape"))?,
                                );
                            }
                        }
                        other => {
                            out.push(other);
                            self.advance();
                        }
                    }
                }
                Some(c) => {
                    self.advance();
                    out.push(c);
                }
            }
        }
        Ok(out)
    }

    fn parse_identifier(&mut self) -> String {
        let mut s = String::new();
        while let Some(c) = self.peek() {
            if c.is_alphanumeric() || c == '_' || c == '$' {
                s.push(self.advance());
            } else {
                break;
            }
        }
        s
    }

    fn parse_number(&mut self) -> Result<Value, Json5Issue> {
        let mut tok = String::new();
        if matches!(self.peek(), Some('+') | Some('-')) {
            tok.push(self.advance());
        }
        if self.peek() == Some('0') && matches!(self.peek_at(1), Some('x') | Some('X')) {
            tok.push(self.advance());
            tok.push(self.advance());
            let mut hex = String::new();
            while matches!(self.peek(), Some(c) if c.is_ascii_hexdigit()) {
                hex.push(self.advance());
            }
            if hex.is_empty() {
                return Err(self.error("hex number has no digits"));
            }
            let mag = u64::from_str_radix(&hex, 16)
                .map_err(|_| self.error("hex number out of range"))?;
            let num = if tok.starts_with('-') {
                match i64::try_from(mag) {
                    Ok(v) => Value::Number((-v).into()),
                    Err(_) => Value::Number(
                        serde_json::Number::from_f64(-(mag as f64))
                            .ok_or_else(|| self.error("hex number out of range"))?,
                    ),
                }
            } else if let Ok(v) = i64::try_from(mag) {
                Value::Number(v.into())
            } else {
                Value::Number(mag.into())
            };
            return Ok(num);
        }
        while let Some(c) = self.peek() {
            if c.is_ascii_digit() {
                tok.push(self.advance());
            } else if c == '.' {
                tok.push(self.advance());
            } else if c == 'e' || c == 'E' {
                tok.push(self.advance());
                if matches!(self.peek(), Some('+') | Some('-')) {
                    tok.push(self.advance());
                }
            } else {
                break;
            }
        }
        if tok.is_empty() || tok == "+" || tok == "-" {
            return Err(self.error("expected a number"));
        }
        let cleaned = tok.strip_prefix('+').unwrap_or(&tok);
        let is_float = cleaned.contains('.') || cleaned.contains('e') || cleaned.contains('E');
        if is_float {
            let f: f64 = cleaned
                .parse()
                .map_err(|_| self.error(format!("invalid number `{tok}`")))?;
            if !f.is_finite() {
                return Err(self.error("number out of range"));
            }
            Ok(Value::Number(
                serde_json::Number::from_f64(f).ok_or_else(|| self.error("invalid number"))?,
            ))
        } else {
            let i: i64 = cleaned
                .parse()
                .map_err(|_| self.error(format!("integer out of range `{tok}`")))?;
            Ok(Value::Number(i.into()))
        }
    }

    fn read_hex(&mut self, n: usize) -> Result<u32, Json5Issue> {
        let mut v: u32 = 0;
        for _ in 0..n {
            let c = self.peek().ok_or_else(|| self.error("unexpected end in escape"))?;
            let d = c
                .to_digit(16)
                .ok_or_else(|| self.error("invalid hex digit in escape"))?;
            v = v * 16 + d;
            self.advance();
        }
        Ok(v)
    }
}

/// Parse a JSON5 document. Returns the value plus non-fatal duplicate-key
/// issues, or a fatal syntax issue carrying the offending line/column.
fn parse_json5(text: &str) -> Result<(Value, Vec<Json5Issue>), Json5Issue> {
    let mut p = Json5Parser::new(text);
    p.skip_trivia()?;
    let value = p.parse_value("")?;
    p.skip_trivia()?;
    if !p.at_end() {
        return Err(p.error("trailing characters after the top-level value"));
    }
    Ok((value, p.issues))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json5_accepts_comments_trailing_commas_and_bare_keys() {
        let text = r#"{
            // line comment
            greeting: 'Hello',   /* block */
            nested: { deep: [1, 0x10, .5, true, null], },
        }"#;
        let (value, issues) = parse_json5(text).unwrap();
        assert!(issues.is_empty(), "{issues:?}");
        let mut flat = BTreeMap::new();
        flatten_into("", value, &mut flat);
        assert_eq!(flat["greeting"], Value::String("Hello".into()));
        assert_eq!(
            flat["nested.deep"],
            Value::Array(vec![
                Value::Number(1.into()),
                Value::Number(16.into()),
                Value::Number(serde_json::Number::from_f64(0.5).unwrap().into()),
                Value::Bool(true),
                Value::Null,
            ])
        );
    }

    #[test]
    fn json5_detects_duplicate_keys_with_dotted_path() {
        let (_, issues) = parse_json5("{ a: 1, a: 2, nested: { b: 1, b: 2 } }").unwrap();
        let keys: Vec<&str> = issues
            .iter()
            .map(|i| i.key.as_deref().unwrap_or_default())
            .collect();
        assert_eq!(keys, ["a", "nested.b"]);
        assert!(issues.iter().all(|i| i.kind == Json5IssueKind::DuplicateKey));
    }

    #[test]
    fn json5_syntax_error_names_line_and_column() {
        let err = parse_json5("{\n  a: 1,\n  b: oops\n}").unwrap_err();
        assert_eq!(err.kind, Json5IssueKind::Syntax);
        assert!(err.message.contains("oops"), "{}", err.message);
        assert_eq!(err.line, 3);
    }

    #[test]
    fn json5_string_escapes_and_hex_and_leading_dot() {
        let (value, _) = parse_json5(
            r#"{ s: "a\nb\tA😀", h: 0xFF, d: .25, e: 1e3, q: 'it\'s' }"#,
        )
        .unwrap();
        let mut flat = BTreeMap::new();
        flatten_into("", value, &mut flat);
        assert_eq!(flat["s"], Value::String("a\nb\tA\u{1F600}".into()));
        assert_eq!(flat["h"], Value::Number(255.into()));
        assert_eq!(flat["d"], Value::Number(serde_json::Number::from_f64(0.25).unwrap().into()));
        assert_eq!(flat["e"], Value::Number(serde_json::Number::from_f64(1000.0).unwrap().into()));
        assert_eq!(flat["q"], Value::String("it's".into()));
    }

    #[test]
    fn interpolate_replaces_known_and_keeps_unknown_placeholders() {
        let mut args = Map::new();
        args.insert("name".into(), Value::String("world".into()));
        args.insert("count".into(), Value::Number(7.into()));
        assert_eq!(
            interpolate("hi {name} x{count} {missing}", Some(&args)),
            "hi world x7 {missing}"
        );
        assert_eq!(interpolate("no {name} here", None), "no {name} here");
    }

    #[test]
    fn chain_appends_default_tail_and_guards_cycles() {
        let mut fallback = BTreeMap::new();
        fallback.insert("zh-TW".to_string(), "zh".to_string());
        fallback.insert("zh".to_string(), "en".to_string());
        let i18n = I18n {
            default_locale: "en".into(),
            locales: vec!["en".into(), "zh".into(), "zh-TW".into()],
            fallback,
            catalogs: BTreeMap::new(),
            catalog_hashes: BTreeMap::new(),
        };
        assert_eq!(i18n.chain("zh-TW"), ["zh-TW", "zh", "en"]);
        assert_eq!(i18n.chain("en"), ["en"]);
        assert_eq!(i18n.chain("fr"), ["fr", "en"]);
    }

    fn write_catalog(dir: &Path, locale: &str, text: &str) {
        let locales = dir.join("locales");
        std::fs::create_dir_all(&locales).unwrap();
        std::fs::write(locales.join(format!("{locale}.json5")), text).unwrap();
    }

    #[test]
    fn load_reports_missing_catalog_warning_and_cycle_error() {
        let dir = tempfile::tempdir().unwrap();
        write_catalog(dir.path(), "en", "{ hello: \"Hi\" }");
        let config = ProjectConfig {
            lang: "en".into(),
            i18n: Some(crate::config::I18nConfig {
                locales: vec!["en".into(), "zh".into(), "a".into(), "b".into()],
                fallback: {
                    let mut f = BTreeMap::new();
                    f.insert("a".to_string(), "b".to_string());
                    f.insert("b".to_string(), "a".to_string());
                    f
                },
            }),
            ..ProjectConfig::default()
        };
        let (_i18n, diagnostics) = I18n::load(dir.path(), &config);
        assert!(
            diagnostics
                .iter()
                .any(|d| d.code == MISSING_CATALOG_CODE && d.file.as_deref() == Some("locales/zh.json5")),
            "{diagnostics:?}"
        );
        assert!(
            diagnostics.iter().any(|d| d.code == FALLBACK_CYCLE_CODE),
            "{diagnostics:?}"
        );
    }

    #[test]
    fn translate_walks_fallback_and_flags_missing_key() {
        let dir = tempfile::tempdir().unwrap();
        write_catalog(dir.path(), "en", "{ greet: \"Hello {name}\", only_en: \"x\" }");
        write_catalog(dir.path(), "zh", "{ greet: \"你好 {name}\" }");
        let config = ProjectConfig {
            lang: "en".into(),
            i18n: Some(crate::config::I18nConfig {
                locales: vec!["en".into(), "zh".into()],
                fallback: {
                    let mut f = BTreeMap::new();
                    f.insert("zh".to_string(), "en".to_string());
                    f
                },
            }),
            ..ProjectConfig::default()
        };
        let (i18n, diagnostics) = I18n::load(dir.path(), &config);
        assert!(diagnostics.is_empty(), "{diagnostics:?}");
        let mut args = Map::new();
        args.insert("name".into(), Value::String("林".into()));
        let (zh_greet, d) = i18n.translate("zh", "greet", Some(&args));
        assert!(d.is_none());
        assert_eq!(zh_greet, "你好 林");
        // `only_en` is not in zh; the chain must fall back to en.
        let (via_fallback, d) = i18n.translate("zh", "only_en", None);
        assert!(d.is_none());
        assert_eq!(via_fallback, "x");
        // Truly absent key returns the literal plus a missing-key warning.
        let (lit, d) = i18n.translate("zh", "nope", None);
        assert_eq!(lit, "nope");
        assert_eq!(d.unwrap().code, MISSING_KEY_CODE);
    }

    #[test]
    fn single_locale_project_without_locales_dir_is_clean() {
        let dir = tempfile::tempdir().unwrap();
        let config = ProjectConfig {
            lang: "en".into(),
            ..ProjectConfig::default()
        };
        let (i18n, diagnostics) = I18n::load(dir.path(), &config);
        assert!(diagnostics.is_empty(), "{diagnostics:?}");
        assert!(!i18n.is_multi());
        assert_eq!(i18n.default_locale(), "en");
    }

    #[test]
    fn locale_id_validation_rejects_traversal_and_empty() {
        assert!(is_valid_locale_id("en"));
        assert!(is_valid_locale_id("zh-CN"));
        assert!(is_valid_locale_id("pt-BR"));
        assert!(!is_valid_locale_id(""));
        assert!(!is_valid_locale_id("../evil"));
        assert!(!is_valid_locale_id("a/b"));
        assert!(!is_valid_locale_id("en_"));
    }
}
