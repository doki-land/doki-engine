# 错误处理（已退役说明）

本页旧错误处理说明绑定过时 Builder / 假想诊断面，**不是**当前产品面。

请改读：

- [文档首页](../index.md)
- [使用指南](../guide/index.md)
- [架构](../architecture/index.md)

当前入口为 `@doki-land/doki` + Rust N-API 构建内核；旧 TypeScript `Builder` 已退役。  
模板定界符由文件扩展名决定：`.doki` / `.dj` 用 `{% %}` code block 与 `{# #}` 注释；`.dejavu` 用 `<% %>` code block 与 `<# #>` 注释。**无**独立输出定界符（不存在 `{{ expr }}` 或 `<%= expr %>`），code block 内按关键词区分 stmt / expr。
