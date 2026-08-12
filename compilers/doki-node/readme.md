# compilers/doki-node (private N-API workspace)

Private N-API **build workspace** for `@doki-land/doki`. **Not published** as `@doki-land/doki-core`.

- Rust crate: `doki-node` (cdylib)
- Build authority crate: `../doki-core`
- Platform stubs: `npm/<sys>/` → published as `@doki-land/doki-<sys>`
- Staged loader: `node ../../scripts/stage-doki-native.mjs` → `runtimes/doki/native/`

```bash
cd compilers/doki-node
npm install --omit=optional
npm run build
npm test
```
