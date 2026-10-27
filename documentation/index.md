# Doki

静态站点工具：Markdown 内容 + Dejavu 模板 + 主题/插件，产出可部署的静态 HTML。

**当前产品入口是 `@doki-land/doki`（Node CLI + 内置 N-API loader；平台包 `@doki-land/doki-<sys>`）。**  
旧的 TypeScript `Builder` 已退役，不再是构建权威。`compilers/doki-node` 是私有 N-API 构建工场，不是 npm 产品名。

模板定界符由文件扩展名决定：`.doki` / `.dj` 用 `{% %}` code block 与 `{# #}` 注释；`.dejavu` 用 `<% %>` code block 与 `<# #>` 注释。**无**独立输出定界符（不存在 `{{ expr }}` 或 `<%= expr %>`），code block 内按关键词区分 stmt / expr。

权威说明在 Dejavu 仓库的 Template Contract；Doki 只消费公开 facade，不另造一套模板语言文档冒充实现。

## 文档状态

本树 `documentation/` 只描述**已交付或明确标旧**的行为。  
内部进度与角色分工写在仓库外的 `决策和进度表/`，不写入本目录。
