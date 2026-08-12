# 🌐 Doki Engine

**A static-site generator for Markdown, templates, themes, and npm plugins.**

Turn a content directory into a deployable static site: Markdown, Dejavu templates, themes, and i18n — all file-based.

Templates are adapted through `@doki-land/dejavu-engine`. **Language semantics follow the Dejavu Template Contract.** Install `@doki-land/doki`, configure `doki.toml`, and run `doki build` / `doki dev`.

## 🧭 Mental model

| You provide | Doki produces |
| --- | --- |
| Markdown with front matter | Rendered pages and feeds |
| Doki templates | Reusable layouts and shells |
| A theme (npm or local) | Visual defaults and components |
| Plugins (npm) | Hooks into build / content |
| Site / build config | A static `dist/` tree |

## ✍️ Content looks like this

```markdown
---
title: A page
tags: [notes, doki]
---

# A page

Write the body in Markdown; let the theme handle presentation.
```

Templates read page and site data through Doki syntax. Build semantics live in Rust (N-API); Node orchestrates the CLI, npm resolution, and plugins. The TypeScript builder in this repository is transitional.

## ✨ Why pick it

- File-based content that works well with Git
- Markdown-first authoring
- Themes and layouts without a hosted control plane
- Built-in internationalization
- Plain static output for any ordinary web host
- Plugin ecosystem on npm (`@doki-land/doki-plugin-*`)

## 🚀 Get started

```bash
pnpm add -g @doki-land/doki
doki new my-site
cd my-site
pnpm dev
```

Build with `doki build`; output goes to `dist/`.

## 📄 License

MIT License © Doki Land

> Repository and package `README` files are English. Product docs for end users live with each site; Dejavu’s user docs are under `dejavu-language/projects/dejavu.ts/homepage/documents/{en-us,zh-hans}`.
