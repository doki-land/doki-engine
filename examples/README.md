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
- `_shared-corpus/` — Markdown content used by the three sites
