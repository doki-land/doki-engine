# 迁移（已退役说明）

本页中的旧迁移步骤与 Liquid / shortcodes / TS Builder 叙事**不是**当前产品面。

请改读：

- [使用指南](./index.md)
- [架构](../architecture/index.md)
- [文档首页](../index.md)

当前入口为 `@doki-land/doki` + Rust N-API 构建内核；旧 TypeScript `Builder` 已退役。  
Doki **不兼容** Liquid / Hugo / Hexo 模板方言；布局用 **Dejavu**（`<% %>` / `|>`），**不是** `{{ }}` / `{% %}`。
