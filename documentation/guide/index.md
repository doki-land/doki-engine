# 使用指南

## 安装

```bash
pnpm add -D @doki-land/doki
```

需要 Node.js ≥ 18。原生 binding 随 `@doki-land/doki` 安装，平台包为 `@doki-land/doki-<sys>`（optionalDependencies）。本地开发可在 `compilers/doki-node`（私有构建工场）执行 `npm run build` 生成 `.node`。

## 新建站点

```bash
pnpm exec doki new .                 # minimal
pnpm exec doki new . --template blog # plain 主题 + 官方插件 + netlify.toml 提示
```

`blog` 模板会带上 path 主题与 sitemap/robots/feed/search 插件目录，便于离线试用。

## 配置（`doki.toml`）

```toml
title = "My Site"
description = "Built with Doki"
content_dir = "content"
output_dir = "dist"
public_dir = "public"
incremental = true

# [theme]
# path = "./themes/plain"
# 或：package = "@doki-land/doki-theme-plain"

# [[plugins]]
# path = "./plugins/sitemap"
# enabled = true
```

开发可用 `doki.local.toml`（需 `--allow-local` 或 `doki dev`）。

主题包根目录可提供 `doki.defaults.toml`，合并顺序为：内核默认 → 主题 defaults → `doki.toml` → local。

## 内容

`content/**/*.md`，可选 YAML（`---`）或 TOML（`+++`）front matter：

```markdown
---
title: Hello
draft: false
---

# Hello

正文是 Markdown。
```

生产构建会跳过 `draft: true`；`doki dev` 会包含草稿。

## 主题与布局

声明式主题：`layouts/*.dejavu`（或 `.dj` / `.html`）。布局使用 **Dejavu** 语法，例如：

```dejavu
<!DOCTYPE html>
<html lang="<% site.lang %>">
<head>
  <title><% page.title %> · <% site.title %></title>
</head>
<body>
  <% content |> safe %>
</body>
</html>
```

**不要**写 Liquid 风格的独立输出定界符 `{{ expr }}`（Dejavu 不存在独立 output slot）。code block 定界符按扩展名区分：`.doki` / `.dj` 用 `{% %}`，`.dejavu` 用 `<% %>`。

## 插件

使用 `@doki-land/doki-plugin` 的 `definePlugin`，经分段协议贡献可序列化结果（例如 `contributeArtifacts` 写出 `sitemap.xml`）。  
插件不得实现第二套构建内核，不得手写最终 `dist/`。

## 构建与检查

```bash
doki build
doki check
doki inspect config
doki explain rebuild content/index.md
```

产物：`dist/pages/…html`、`dist/.doki/build-manifest.json`，以及插件贡献的根级文件（如 `sitemap.xml`）。

## 部署配置

```bash
doki deploy netlify
doki deploy vercel
doki deploy github
doki deploy cloudflare
```

生成的构建命令为 `doki build`。

## 未交付（勿按旧文档操作）

以下内容曾出现在历史指南中，**当前内核未交付**，请忽略任何仍残留的链接：

- shortcodes 子系统与 `{% image %}` 一类标签  
- 完整图片优化管线 API  
- 完整 i18n / locales 运行时  
- TypeScript `Builder` / `doki-engine` 旧包作为正式入口  
- `doki serve` 作为与旧 Builder 绑定的开发服务器（请用 `doki dev`）
