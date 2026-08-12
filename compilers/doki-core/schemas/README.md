# Editor schemas (optional)

**Authority is the Rust types and validators in this crate** (`ProjectConfig`, `ExtensionRef`, …), not these files.

Doki has a single build-core implementation path — there is no multi-language conformance suite that needs a separate `specifications/` tree (unlike Dejavu).

JSON Schema here is only for editor assist (`doki.toml` / manifests). If they drift, fix the Rust model first, then refresh these hints.
