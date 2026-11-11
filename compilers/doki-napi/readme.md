# compilers/doki-node — private N-API workspace

**Build workspace only.** This crate (`doki-node`) is the N-API `cdylib` shell. All real build authority lives in **`../doki-core`**. Nothing here is published directly.

## What this directory contains

| Item                              | Role                                           |
|-----------------------------------|------------------------------------------------|
| `src/lib.rs`                      | N-API bindings — thin JSON-in / JSON-out bridge |
| `build.rs` + Cargo.toml           | N-API build setup                              |
| `npm/<sys>/package.json`          | Platform-specific stubs → published as `@doki-land/doki-<sys>` |
| `scripts/pack-smoke.mjs`          | Post-build pack smoke test                     |

## Build flow

```bash
# From repo root — builds the .node addon + stages loader
pnpm --filter @doki-land/doki build:release

# Or standalone debug build
cd compilers/doki-node
npm run build:debug
npm test
```

## Contract

- N-API contract id: `doki.napi/1` (from `bindingContractVersion()`)
- All business semantics live in `doki-core`. This crate only: serializes JSON → calls core → serializes result → returns.
- No logging, no plugin dispatch, no config parsing, no stdio handling.
- Diagnostics use the Dejavu shape: `code` / `severity` / `stage` / `message` / `span` / `path` / `argsJson` / `related`.
