# 语法（已退役说明）

本目录曾冒充 Liquid 风格或未实现的「Doki 模板语法」，**全部作废**，不是当前产品面。

请改读：模板定界符由文件扩展名决定：`.doki` / `.dj` 用 `{% %}` code block 与 `{# #}` 注释；`.dejavu` 用 `<% %>` code block 与 `<# #>` 注释。**无**独立输出定界符（不存在 `{{ expr }}` 或 `<%= expr %>`），code block 内按关键词区分 stmt / expr。
权威语法在 Dejavu 仓库的 Template Contract；Doki 不另造一套模板语言文档。

当前入口为 `@doki-land/doki` + Rust N-API 构建内核；旧 TypeScript `Builder` 已退役。