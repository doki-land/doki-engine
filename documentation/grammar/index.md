# 语法（已退役说明）

本目录曾冒充 Liquid 风格或未实现的「Doki 模板语法」，**全部作废**，不是当前产品面。

请改读：

- [文档首页](../index.md)
- [使用指南](../guide/index.md)
- [架构](../architecture/index.md)

站点布局使用 **Dejavu** 公开 facade（默认定界符 `<% %>` 与 `|>` filter），**不是** `{{ }}` / `{% %}`。  
权威语法在 Dejavu 仓库的 Template Contract；Doki 不另造一套模板语言文档。

当前入口为 `@doki-land/doki` + Rust N-API 构建内核；旧 TypeScript `Builder` 已退役。
