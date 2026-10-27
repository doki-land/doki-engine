# 配置（已退役说明）

本页若仍描述旧配置键、Liquid 模板或 TS Builder 配置面，**均已过时**。

请改读：

- [使用指南](./index.md)（以 `doki.toml` / `doki.local.toml` 为准）
- [架构](../architecture/index.md)
- [文档首页](../index.md)

当前入口为 `@doki-land/doki` + Rust N-API 构建内核；旧 TypeScript `Builder` 已退役。  
模板定界符由文件扩展名决定：`.doki` / `.dj` 用 `{% %}` code block 与 `{# #}` 注释；`.dejavu` 用 `<% %>` code block 与 `<# #>` 注释。**无**独立输出定界符（不存在 `{{ expr }}` 或 `<%= expr %>`），code block 内按关键词区分 stmt / expr。
