# ⚠️ `@doki-land/doki-lsp` — deprecated

This Node/TypeScript language server is **not** the supported IDE path.

## Policy

| Surface | Provider |
|---------|----------|
| Library APIs (TS / Py / C# / Kotlin / …) | language-specific `dejavu` / `@doki-land/dejavu` packages |
| LSP / full editor experience | **Rust `dejavu` binary only** (`dejavu lsp`) |

Do not add features here. Editors (including Doki VS Code) must spawn the Rust binary.

This tree is kept only as historical reference and is excluded from the workspace / npm release.
