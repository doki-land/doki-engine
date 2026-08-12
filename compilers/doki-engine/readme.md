# Doki Engine (legacy package tree)

Formal product entry is **`@doki-land/doki`** (CLI + N-API loader) with platform packages `@doki-land/doki-<sys>`, backed by Rust crates `doki-core` / `doki-node`.

This tree’s TypeScript `Builder` / `PluginManager` / shortcode APIs are **not** the build authority—calls throw. Do not copy the old programmatic samples below from history.

## Install / use

```bash
pnpm add -g @doki-land/doki
# or in a site: pnpm add -D @doki-land/doki
doki new my-site
cd my-site
pnpm build   # → doki build
pnpm dev     # → doki dev
```

Configure with **`doki.toml`** only. Layout templates use **Dejavu** (`<% %>` / `|>`), not Liquid `{{ }}` / `{% %}`.

See:

- `documentation/index.md`
- `documentation/guide/index.md`
- `documentation/architecture/index.md`

Internal decisions live under Spark `决策和进度表/doki-rust-build-kernel.md` (not here).

## License

MIT License © Doki Land
