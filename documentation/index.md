# Doki

静态站点工具：Markdown 内容 + Dejavu 模板 + 主题/插件，产出可部署的静态 HTML。

**当前产品入口是 `@doki-land/doki`（Node CLI + 内置 N-API loader；平台包 `@doki-land/doki-<sys>`）。**  
旧的 TypeScript `Builder` 已退役，不再是构建权威。`compilers/doki-node` 是私有 N-API 构建工场，不是 npm 产品名。

## 目录

- [快速开始](#快速开始)
- [已交付能力](#已交付能力)
- [刻意不做 / 另有计划](#刻意不做--另有计划)
- [架构](#架构)
- [模板语法](#模板语法)
- [文档状态](#文档状态)

## 快速开始

```bash
pnpm add -D @doki-land/doki
pnpm exec doki new my-site
# 或：doki new my-site --template blog
cd my-site
pnpm doki build
```

常用命令：

| 命令 | 作用 |
| --- | --- |
| `doki new [dir]` | 脚手架（`minimal` / `blog`） |
| `doki build` | 生产构建 |
| `doki check` | check 模式构建 |
| `doki dev` / `doki dev --watch` | 开发构建（可选监视） |
| `doki inspect config\|theme\|plugins\|page …` | 会话只读检查 |
| `doki explain rebuild <path>` | 解释路径变更是否触发重建 |
| `doki deploy <netlify\|vercel\|github\|cloudflare>` | 写入主机配置 |
| `doki doctor` | 检查 Node + native binding |

配置唯一入口：`doki.toml`（开发可叠加 `doki.local.toml`）。

## 已交付能力

以当前 Rust 内核与 CLI 为准（有测试/产物证据的才写在这里）：

- **配置**：Figment 加载 `doki.toml`；主题 `doki.defaults.toml` 合并层；`path` / `package` 扩展与 overrides
- **内容**：Markdown + YAML/TOML front matter；draft；内容图与增量失效
- **渲染**：Markdown → HTML → Dejavu 公开 facade 布局；主题 `layouts/`；`public/` 与主题 `assets/` 复制
- **构建**：分段 plan → 插件 hook → staging → 原子提交；`dist/.doki/build-manifest.json`
- **可解释性**：`inspect`、`explain rebuild`
- **官方插件（分段协议）**：sitemap、robots、feed、search
- **主题**：`@doki-land/doki-theme-plain` 等声明式主题包

## 刻意不做 / 另有计划

| 项 | 说明 |
| --- | --- |
| 模板内执行 JS | 静态引擎边界；交互式 JS 应用见独立计划（vmz-framework），不混入 Dejavu |
| Liquid / Hugo / Hexo 模板方言 | 不兼容；模板语义以 Dejavu 为准 |
| 旧 TS `Builder` / shortcodes 文档中的 API | **已退役或未交付**；下文旧指南已清理或标旧 |
| 完整图片管线 / i18n / MDX | 未作为当前内核承诺；有需求再按真实站点补 |

## 架构

```
@doki-land/doki          Node CLI + N-API loader（唯一门面）
        │ optionalDeps
@doki-land/doki-*         平台 .node（如 `doki-win32-x64`，无 `-msvc`）
        │
doki-core（Rust crate）   唯一构建语义（不发 npm 同名包）
        └─ Dejavu public facade
```

详见 [架构](./architecture/index.md)。

## 模板语法

站点布局使用 **Dejavu** 默认定界符（例如 `<% %>` / 表达式与 `|>` filter），**不是** `{{ }}` / `{% %}` Liquid 方言。

权威说明在 Dejavu 仓库的 Template Contract；Doki 只消费公开 facade，不另造一套模板语言文档冒充实现。

## 文档状态

本树 `documentation/` 只描述**已交付或明确标旧**的行为。  
内部进度与角色分工写在仓库外的 `决策和进度表/`，不写入本目录。
