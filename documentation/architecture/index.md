# 架构

Doki = **Node 生态入口 + Rust N-API 构建内核**。

## 职责划分

| 层 | 包 / crate | 职责 |
| --- | --- | --- |
| CLI | `@doki-land/doki` | 找项目根、项目本地版本 handoff、扩展 path\|package 解析、插件 Worker、`dev`/`build`/`deploy` |
| Native 加载 | `@doki-land/doki`（内置 loader）+ 平台 optionalDeps `@doki-land/doki-<sys>` | 加载 `.node`；无业务语义 |
| 构建权威 | Rust `doki-core` | 配置、内容图、增量、staging、原子提交、Dejavu 渲染、插件结果校验 |
| 模板 | Dejavu 公开 facade | 布局渲染；不知 Doki |
| 插件 SDK | `@doki-land/doki-plugin` | `definePlugin`；经可序列化 hook 贡献补丁/产物 |

## 构建会话（概念）

1. `openProject`（可选主题 defaults）  
2. Node 解析扩展 → `setResolvedExtensions`  
3. `prepareBuild` → 若有 `pendingHooks`，Node 跑插件 → `continueBuild`  
4. 内核渲染并写入 staging（含 `public/`、主题 assets、插件 artifacts）  
5. `commitBuild` → 输出目录 + `dist/.doki/build-manifest.json`

## 已退役

TypeScript `Builder` / 旧进程内 `PluginManager` **不是**构建权威；调用会抛错。请使用 `@doki-land/doki`。

## 扩展

- 主题 / 插件须在 `doki.toml` 用 `path` **或** `package` 显式声明  
- 同一 manifest 模型；overrides 可将 package 指到本地 path  
- 插件钩子输入不可变；结果经 Rust 校验；不写最终输出目录、不碰 Dejavu 内部对象
