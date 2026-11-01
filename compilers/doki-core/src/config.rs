use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use figment::{
    providers::{Format, Serialized, Toml},
    Figment,
};
use serde::{Deserialize, Serialize};

use crate::error::{ConfigError, ConfigResult};
use crate::i18n::is_valid_locale_id;

/// Absolute project root that contains `doki.toml`.
#[derive(Debug, Clone)]
pub struct ProjectPaths {
    pub root: PathBuf,
    pub config_file: PathBuf,
}

/// Exactly one of `path` or `package`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExtensionRef {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package: Option<String>,
}

impl ExtensionRef {
    pub fn validate(&self, field: &str) -> ConfigResult<()> {
        match (&self.path, &self.package) {
            (Some(p), None) if !p.trim().is_empty() => Ok(()),
            (None, Some(pkg)) if !pkg.trim().is_empty() => Ok(()),
            (Some(_), Some(_)) => Err(ConfigError::invalid(format!(
                "{field}: set either `path` or `package`, not both"
            ))),
            _ => Err(ConfigError::invalid(format!(
                "{field}: require exactly one of `path` or `package`"
            ))),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PluginEntry {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<serde_json::Value>,
}

fn default_true() -> bool {
    true
}

impl PluginEntry {
    pub fn as_extension_ref(&self) -> ExtensionRef {
        ExtensionRef {
            path: self.path.clone(),
            package: self.package.clone(),
        }
    }

    pub fn validate(&self, index: usize) -> ConfigResult<()> {
        self.as_extension_ref()
            .validate(&format!("plugins[{index}]"))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OverrideTarget {
    pub path: String,
}

/// `[i18n]` block: enabled locales plus the explicit fallback chain.
///
/// `locales` must contain the site `lang` (the chain tail). `fallback` maps a
/// locale to its explicit parent; every chain still ends at `lang`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct I18nConfig {
    pub locales: Vec<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub fallback: BTreeMap<String, String>,
}

/// Logical `doki.toml` model after Figment merge (this type + `validate()` are authoritative).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProjectConfig {
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(default = "default_lang")]
    pub lang: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub i18n: Option<I18nConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default = "default_content_dir")]
    pub content_dir: String,
    #[serde(default = "default_output_dir")]
    pub output_dir: String,
    #[serde(default = "default_public_dir")]
    pub public_dir: String,
    #[serde(default = "default_data_dir")]
    pub data_dir: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme: Option<ExtensionRef>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub plugins: Vec<PluginEntry>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub overrides: BTreeMap<String, OverrideTarget>,
    #[serde(default = "default_true")]
    pub incremental: bool,
}

fn default_lang() -> String {
    "en".into()
}
fn default_content_dir() -> String {
    "content".into()
}
fn default_output_dir() -> String {
    "dist".into()
}
fn default_public_dir() -> String {
    "public".into()
}
fn default_data_dir() -> String {
    "data".into()
}

impl Default for ProjectConfig {
    fn default() -> Self {
        Self {
            title: "My Doki Site".into(),
            description: None,
            base_url: None,
            lang: default_lang(),
            i18n: None,
            author: None,
            content_dir: default_content_dir(),
            output_dir: default_output_dir(),
            public_dir: default_public_dir(),
            data_dir: default_data_dir(),
            theme: None,
            plugins: Vec::new(),
            overrides: BTreeMap::new(),
            incremental: true,
        }
    }
}

impl ProjectConfig {
    pub fn validate(&self) -> ConfigResult<()> {
        if self.title.trim().is_empty() {
            return Err(ConfigError::invalid("`title` must not be empty"));
        }
        if !is_valid_locale_id(&self.lang) {
            return Err(ConfigError::invalid(format!(
                "`lang` must be a locale id like `en` or `zh-CN`, got `{}`",
                self.lang
            )));
        }
        if let Some(theme) = &self.theme {
            theme.validate("theme")?;
        }
        for (i, plugin) in self.plugins.iter().enumerate() {
            plugin.validate(i)?;
        }
        for (name, target) in &self.overrides {
            if name.trim().is_empty() || target.path.trim().is_empty() {
                return Err(ConfigError::invalid(
                    "overrides entries require non-empty package name and path",
                ));
            }
        }
        if let Some(i18n) = &self.i18n {
            self.validate_i18n(i18n)?;
        }
        Ok(())
    }

    fn validate_i18n(&self, i18n: &I18nConfig) -> ConfigResult<()> {
        if i18n.locales.is_empty() {
            return Err(ConfigError::invalid(
                "`i18n.locales` must list at least one locale",
            ));
        }
        let mut seen: BTreeSet<&str> = BTreeSet::new();
        for locale in &i18n.locales {
            if !is_valid_locale_id(locale) {
                return Err(ConfigError::invalid(format!(
                    "`i18n.locales` entry `{locale}` is not a valid locale id"
                )));
            }
            if !seen.insert(locale.as_str()) {
                return Err(ConfigError::invalid(format!(
                    "`i18n.locales` lists `{locale}` more than once"
                )));
            }
        }
        if !seen.contains(self.lang.as_str()) {
            return Err(ConfigError::invalid(format!(
                "`i18n.locales` must include the site `lang` `{}`",
                self.lang
            )));
        }
        for (child, parent) in &i18n.fallback {
            if !seen.contains(child.as_str()) {
                return Err(ConfigError::invalid(format!(
                    "`i18n.fallback` key `{child}` is not listed in `i18n.locales`"
                )));
            }
            if !seen.contains(parent.as_str()) {
                return Err(ConfigError::invalid(format!(
                    "`i18n.fallback` parent `{parent}` of `{child}` is not listed in `i18n.locales`"
                )));
            }
            if child == &self.lang {
                return Err(ConfigError::invalid(format!(
                    "`i18n.fallback` must not give the site `lang` `{child}` a parent, every chain ends at `lang`"
                )));
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct LoadOptions {
    /// When true, merge `doki.local.toml` if present (development).
    pub allow_local: bool,
    /// Absolute path to a theme `doki.defaults.toml` (Node-resolved package themes).
    /// Path themes are auto-discovered under the theme root when this is `None`.
    pub theme_defaults: Option<PathBuf>,
}

impl Default for LoadOptions {
    fn default() -> Self {
        Self {
            allow_local: false,
            theme_defaults: None,
        }
    }
}

/// Peek `[theme]` from `doki.toml` without full project extract (for Node resolution).
pub fn peek_theme_ref(root: impl AsRef<Path>) -> ConfigResult<Option<ExtensionRef>> {
    #[derive(Debug, Deserialize)]
    struct ThemePeek {
        theme: Option<ExtensionRef>,
    }

    let root = root.as_ref();
    let config_file = root.join("doki.toml");
    if !config_file.is_file() {
        return Err(ConfigError::invalid(format!(
            "missing doki.toml under {}",
            root.display()
        )));
    }
    let peek: ThemePeek = Figment::new()
        .merge(Toml::file(&config_file))
        .extract()
        .map_err(|source| ConfigError::Extract { source })?;
    if let Some(theme) = &peek.theme {
        theme.validate("theme")?;
    }
    Ok(peek.theme)
}

/// Resolve the theme defaults file for a theme root directory, if present.
pub fn theme_defaults_file(theme_root: impl AsRef<Path>) -> Option<PathBuf> {
    let theme_root = theme_root.as_ref();
    for name in ["doki.defaults.toml", "theme.defaults.toml"] {
        let candidate = theme_root.join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// Load and validate project configuration with Figment.
///
/// Layer order: core defaults → theme defaults → `doki.toml` → optional `doki.local.toml`.
/// Process env is not merged — stray `DOKI_*` vars are not part of the locked config surface.
pub fn load_project_config(
    root: impl AsRef<Path>,
    options: LoadOptions,
) -> ConfigResult<(ProjectPaths, ProjectConfig)> {
    let root = root
        .as_ref()
        .canonicalize()
        .map_err(|source| ConfigError::Io { source })?;
    let config_file = root.join("doki.toml");
    if !config_file.is_file() {
        return Err(ConfigError::invalid(format!(
            "missing doki.toml under {}",
            root.display()
        )));
    }

    let theme_defaults_path = resolve_theme_defaults_path(&root, &options)?;

    let mut figment = Figment::new().merge(Serialized::defaults(ProjectConfig::default()));

    if let Some(path) = &theme_defaults_path {
        figment = figment.merge(Toml::file(path));
    }

    figment = figment.merge(Toml::file(&config_file));

    let local = root.join("doki.local.toml");
    if options.allow_local && local.is_file() {
        figment = figment.merge(Toml::file(&local));
    }

    let config: ProjectConfig = figment
        .extract()
        .map_err(|source| ConfigError::Extract { source })?;
    config.validate()?;

    Ok((
        ProjectPaths {
            root,
            config_file,
        },
        config,
    ))
}

fn resolve_theme_defaults_path(
    root: &Path,
    options: &LoadOptions,
) -> ConfigResult<Option<PathBuf>> {
    if let Some(explicit) = &options.theme_defaults {
        if !explicit.is_file() {
            return Err(ConfigError::invalid(format!(
                "theme defaults file not found: {}",
                explicit.display()
            )));
        }
        return Ok(Some(explicit.clone()));
    }

    // Auto path-theme defaults: peek doki.toml [theme].path only (package themes need Node).
    let theme = peek_theme_ref(root)?;
    if let Some(theme) = theme {
        if let Some(rel) = &theme.path {
            let theme_root = root.join(rel);
            return Ok(theme_defaults_file(theme_root));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn loads_path_and_package_plugins() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("doki.toml"),
            r#"
title = "Docs"
base_url = "https://docs.example.com"
content_dir = "content"
output_dir = "dist"

[theme]
path = "./themes/docs"

[[plugins]]
path = "./plugins/related-pages"
options = { limit = 6 }

[[plugins]]
package = "@doki-land/plugin-search"
enabled = true
"#,
        )
        .unwrap();

        let (_paths, cfg) = load_project_config(dir.path(), LoadOptions::default()).unwrap();
        assert_eq!(cfg.title, "Docs");
        assert_eq!(cfg.theme.as_ref().unwrap().path.as_deref(), Some("./themes/docs"));
        assert_eq!(cfg.plugins.len(), 2);
        assert_eq!(cfg.plugins[0].path.as_deref(), Some("./plugins/related-pages"));
        assert_eq!(
            cfg.plugins[1].package.as_deref(),
            Some("@doki-land/plugin-search")
        );
    }

    #[test]
    fn rejects_theme_with_both_path_and_package() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("doki.toml"),
            r#"
title = "X"
[theme]
path = "./themes/a"
package = "@scope/theme"
"#,
        )
        .unwrap();

        let err = load_project_config(dir.path(), LoadOptions::default()).unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("path") || msg.contains("package") || format!("{err:?}").contains("path"),
            "{err:?}"
        );
    }

    #[test]
    fn local_overlay_only_when_allowed() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("doki.toml"),
            r#"
title = "Base"
[theme]
package = "@doki-land/theme-docs"
"#,
        )
        .unwrap();
        fs::write(
            dir.path().join("doki.local.toml"),
            r#"
title = "LocalDev"
"#,
        )
        .unwrap();

        let (_, prod) = load_project_config(
            dir.path(),
            LoadOptions {
                allow_local: false,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(prod.title, "Base");

        let (_, dev) = load_project_config(
            dir.path(),
            LoadOptions {
                allow_local: true,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(dev.title, "LocalDev");
    }

    #[test]
    fn theme_defaults_under_path_theme_merge_before_doki_toml() {
        let dir = tempfile::tempdir().unwrap();
        let theme = dir.path().join("themes/docs");
        fs::create_dir_all(&theme).unwrap();
        fs::write(
            theme.join("doki.defaults.toml"),
            r#"
lang = "zh"
author = "Theme Author"
description = "from theme"
"#,
        )
        .unwrap();
        fs::write(
            dir.path().join("doki.toml"),
            r#"
title = "Site Wins"
description = "from project"
[theme]
path = "./themes/docs"
"#,
        )
        .unwrap();

        let (_, cfg) = load_project_config(dir.path(), LoadOptions::default()).unwrap();
        assert_eq!(cfg.title, "Site Wins");
        assert_eq!(cfg.lang, "zh");
        assert_eq!(cfg.author.as_deref(), Some("Theme Author"));
        assert_eq!(cfg.description.as_deref(), Some("from project"));
    }

    #[test]
    fn explicit_theme_defaults_path_for_package_themes() {
        let dir = tempfile::tempdir().unwrap();
        let defaults = dir.path().join("vendor/theme/doki.defaults.toml");
        fs::create_dir_all(defaults.parent().unwrap()).unwrap();
        fs::write(&defaults, "lang = \"ja\"\n").unwrap();
        fs::write(
            dir.path().join("doki.toml"),
            r#"
title = "Pkg"
[theme]
package = "@acme/theme"
"#,
        )
        .unwrap();

        let (_, cfg) = load_project_config(
            dir.path(),
            LoadOptions {
                theme_defaults: Some(defaults),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(cfg.lang, "ja");
    }

    #[test]
    fn i18n_block_loads_and_chains_are_validated() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("doki.toml"),
            r#"
title = "Multi"
lang = "en"

[i18n]
locales = ["en", "zh", "zh-TW"]

[i18n.fallback]
"zh-TW" = "zh"
"#,
        )
        .unwrap();

        let (_, cfg) = load_project_config(dir.path(), LoadOptions::default()).unwrap();
        let i18n = cfg.i18n.expect("[i18n] parses");
        assert_eq!(i18n.locales, ["en", "zh", "zh-TW"]);
        assert_eq!(i18n.fallback.get("zh-TW").map(String::as_str), Some("zh"));

        // locales must contain the site lang
        let bad = ProjectConfig {
            lang: "en".into(),
            i18n: Some(I18nConfig {
                locales: vec!["zh".into()],
                fallback: BTreeMap::new(),
            }),
            ..ProjectConfig::default()
        };
        assert!(bad.validate().unwrap_err().to_string().contains("lang"));

        // fallback endpoints must be listed locales
        let bad_parent = ProjectConfig {
            lang: "en".into(),
            i18n: Some(I18nConfig {
                locales: vec!["en".into(), "zh".into()],
                fallback: BTreeMap::from([("zh".to_string(), "de".to_string())]),
            }),
            ..ProjectConfig::default()
        };
        assert!(
            bad_parent
                .validate()
                .unwrap_err()
                .to_string()
                .contains("i18n.locales")
        );

        // the site lang never gets a fallback parent
        let bad_lang_parent = ProjectConfig {
            i18n: Some(I18nConfig {
                locales: vec!["en".into(), "zh".into()],
                fallback: BTreeMap::from([("en".to_string(), "zh".to_string())]),
            }),
            ..ProjectConfig::default()
        };
        assert!(
            bad_lang_parent
                .validate()
                .unwrap_err()
                .to_string()
                .contains("chain ends at `lang`")
        );

        // locale ids reject traversal and separators
        let bad_id = ProjectConfig {
            lang: "../evil".into(),
            ..ProjectConfig::default()
        };
        assert!(bad_id.validate().unwrap_err().to_string().contains("lang"));
    }
}
