# Shortcodes（已退役说明）

Shortcodes 子系统与 `{% … %}` 一类标签**已退役或未交付**，本页不是当前产品面。

请改读：

- [使用指南](./index.md)
- [架构](../architecture/index.md)
- [文档首页](../index.md)

模板定界符由文件扩展名决定：`.doki` / `.dj` 用 `{% %}` code block 与 `{# #}` 注释；`.dejavu` 用 `<% %>` code block 与 `<# #>` 注释。**无**独立输出定界符（不存在 `{{ expr }}` 或 `<%= expr %>`），code block 内按关键词区分 stmt / expr。
