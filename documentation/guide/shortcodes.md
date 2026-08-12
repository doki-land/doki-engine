# Shortcodes（已退役说明）

Shortcodes 子系统与 `{% … %}` 一类标签**已退役或未交付**，本页不是当前产品面。

请改读：

- [使用指南](./index.md)
- [架构](../architecture/index.md)
- [文档首页](../index.md)

当前入口为 `@doki-land/doki` + Rust N-API 构建内核；旧 TypeScript `Builder` 已退役。  
布局使用 **Dejavu**（默认定界符 `<% %>` 与 `|>` filter），**不是** Liquid 风格的 `{{ }}` / `{% %}`。
