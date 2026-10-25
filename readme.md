# 🌐 Doki Engine

**A static-site generator for Markdown, Dejavu templates, themes, and npm plugins.**

Turn a content directory into a deployable static site — Markdown with front matter for content, Dejavu templates (with Dejavu's default **`<% %>` delimiters**) for layouts, themes for visual defaults, and plugins for hooks. Everything is file-based; no hosted control plane.

Build kernel lives in Rust (`doki-core` crate, consumes the `dejavu` public crate for rendering). The CLI and plugin host are Node.

Repository: [`doki-land/doki-engine`](https://github.com/doki-land/doki-engine/tree/dev) (`dev`).

## 🧭 Mental model

| You provide                  | Doki produces               |
|------------------------------|-----------------------------|
| `content/*.md` with front matter | Rendered pages, feeds, and sitemap |
| `layouts/*.doki` or `*.html` | Reusable layouts (`<% extends %>`, `<% block %>`, `<% include %>`) |
| A theme (npm package or local) | Visual defaults + shortcodes |
| Plugins (`@doki-land/doki-plugin-*`) | Hooks into build/content/events |
| `doki.toml` + optional `package.json` | A static `dist/` tree ready for any web host |

## ✍️ Content looks like this

```markdown
---
title: A page
tags: [notes, doki]
---

# A page

Write the body in Markdown; let the theme handle presentation.
```

Layouts look like Dejavu with its default delimiters:

```doki
<!DOCTYPE html>
<html lang="<% site.lang %>">
<head><title><% page.title %></title></head>
<body>
  <% content |> safe %>
</body>
</html>
```

## ✨ Why pick it

- File-based content that works well with Git
- Markdown-first authoring, Dejavu-powered layouts
- Themes and layouts without a hosted control plane
- Plain static output for any ordinary web host (Cloudflare Pages, Netlify, Vercel, GitHub Pages, your Nginx)
- Plugin ecosystem on npm (`@doki-land/doki-plugin-*`)
- Rust build kernel — fast, no Node-only rendering path

## 🚀 Get started

```bash
pnpm add -g @doki-land/doki
doki new my-site
cd my-site
doki dev        # → http://localhost:4000
doki build      # → dist/
```

## 🗂 Repository layout

| Path                            | Role                                                  |
|---------------------------------|-------------------------------------------------------|
| `compilers/doki-core/`          | Rust SSG build kernel (config, content graph, render, session) |
| `compilers/doki-node/`          | N-API build workspace — private, builds the `.node` addon |
| `compilers/doki-engine/`        | Legacy TypeScript builder tree — **do not use**       |
| `compilers/doki-lsp/`           | Legacy TS/LSP path — **do not use**, editors use `dejavu lsp` |
| `compilers/doki-migrate/`       | Legacy migrate CLI — private historical code           |
| `compilers/doki-deploy/`        | Legacy deploy CLI — private historical code           |
| `runtimes/doki/`                | `@doki-land/doki` product CLI (Node wrapper + native loader) |
| `runtimes/themes/`              | Default theme + theme template                        |
| `runtimes/plugins/`              | Plugin template + example plugins                     |
| `runtimes/editors/`             | VS Code extension                                     |
| `runtimes/homepage/`            | doki.engine homepage (self-built)                     |
| `examples/`                     | Historical /不均衡 examples — prefer `doki new my-site` |
| `scripts/`                      | Release, pack, stage, smoke test scripts              |

## 🛠 Development

Requires Rust toolchain + Node.js 20+ + pnpm 10.

```bash
# Rust workspace
cargo test --workspace

# Node workspace + N-API
pnpm install
pnpm --filter @doki-land/doki build     # builds + stages the native addon
pnpm --filter @doki-land/doki test

# Standalone N-API debug build
cd compilers/doki-node
npm run build:debug
npm test
```

## 📚 Documentation

End-user docs ship with `@doki-land/doki`. Architecture and contributor docs live in `documentation/`:

| Kind                  | Start here                                                      |
|-----------------------|-----------------------------------------------------------------|
| Architecture overview | [`documentation/architecture/index.md`](./documentation/architecture/index.md) |
| Guide index           | [`documentation/guide/index.md`](./documentation/guide/index.md)       |
| Grammar reference     | [`documentation/grammar/index.md`](./documentation/grammar/index.md)   |

For template language details, see the Dejavu project docs at [`dejavu-language`](https://github.com/doki-land/dejavu-language) — Doki's template engine **is** Dejavu with its default `<% %>` delimiters.

## 📄 License

[MIT](./License.md) © Doki Land
