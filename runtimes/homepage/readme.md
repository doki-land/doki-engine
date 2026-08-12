# 🏠 Doki Engine Homepage

Source for the Doki Engine marketing / docs site, built with Doki itself.

## ✨ Features

- 📝 Markdown-driven content
- 🎨 Doki templates
- 🌍 Multi-language ready
- 📊 Sitemap and OG tags
- ⚡ Dejavu templates (contract-faithful; Rust kernel target)

## 📁 Layout

```
homepage/
├── content/
├── templates/
├── static/
├── doki.toml
└── dist/
```

## 🚀 Develop

```bash
pnpm install
pnpm dev
pnpm build
```

## ⚙️ Config

```toml
[site]
title = "Doki Engine"
description = "A static site generator powered by Dejavu"
author = "Doki Engine Team"

[build]
source = "content"
templates = "templates"
output = "dist"
static = "static"

[theme]
name = "default"
```

## 📄 License

MIT
