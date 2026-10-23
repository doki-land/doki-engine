# doki-lsp — frozen TypeScript path

**Do not use.** The LSP is now a **single Rust binary** (`dejavu lsp` in `dejavu-tools`) with a protocol-consistent JSON interface. Editors (including VS Code) launch that binary directly.

- This directory's TypeScript parser / TS template engine is frozen — kept only for reference and historical tests.
- No new LSP features should land here. Rust `dejavu-tools` is the single implementation.
- Conformance fixtures are shared with `dejavu-language/specifications/`.

## Editor side

VS Code extension at `runtimes/editors/vscode-doki/` launches the Rust binary via `child_process.spawn` — it does **not** embed this TS LSP.

## License

[MIT](../../License.md) © Doki Land
