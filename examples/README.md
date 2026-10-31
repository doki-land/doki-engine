# Doki examples

Sample sites under this folder are **historical / uneven**. Prefer scaffolding from the current CLI:

```bash
doki new my-site
```

Templates pick delimiters by file extension: `.doki` / `.dj` → `{% %}`; `.dejavu` → `<% %>`. No independent output slot (`{{ expr }}` or `<%= expr %>`).

Product docs: `documentation/guide/index.md`.

## Fate blog examples

- `doki-blog/` — Doki site using `doki-theme-fate/`
- `hexo-blog/` — Hexo site using `hexo-theme-fate/`
- `hugo-blog/` — Hugo site using `hugo-theme-fate/`
- `_shared-corpus/` — the only authored content source for the three sites
- `hexo-blog/` and `hugo-blog/` content trees are generated from the corpus by `examples/scripts/project-corpus.mjs`, checked by `pnpm examples:corpus:check`
