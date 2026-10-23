# Doki Engine (legacy TypeScript tree)

**Do not use.** This directory is the frozen legacy TypeScript builder. The actual product entry is:

- **`@doki-land/doki`** — Node CLI + N-API loader
- **`doki-core`** — Rust SSG build kernel (this repo, under `compilers/doki-core/`)

The old TypeScript `Builder` / `PluginManager` / shortcode APIs here **throw on call**. Do not copy old programmatic samples from git history.

## Where to work

| What you want                 | Go here                                     |
|-------------------------------|---------------------------------------------|
| New build / content feature   | `compilers/doki-core/` (Rust)              |
| New plugin hook               | `compilers/doki-core/src/session.rs` → hook plan |
| CLI change / npm resolution   | `runtimes/doki/`                            |
| Dejavu render issue           | [`doki-core/src/render.rs`](../doki-core/src/render.rs) or [`dejavu-language`](https://github.com/doki-land/dejavu-language) |
| Template language grammar     | `dejavu-language` repo (Dejavu Template Contract) |

## License

[MIT](../../License.md) © Doki Land
