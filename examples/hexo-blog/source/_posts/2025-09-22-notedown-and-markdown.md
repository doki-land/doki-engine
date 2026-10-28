---
title: Notedown 与 Markdown 语义
date: 2025-09-22
description: Notedown 如何在保持 Markdown 熟悉感的同时，提供结构化 IR 和可扩展的语义层。
tags: [技术, Notedown]
cover: assets/post-notedown.jpg
---

## 从"渲染器"到"语义层"

大多数 Markdown 工具走的路径是：

```
Markdown 文本 → parser → AST → HTML 渲染器 → HTML 字符串
```

Notedown 多了一层：**canonical IR**。

```
Markdown / 其它来源
        │
        ▼
   Notedown IR   ← 语义真相源
        │
   ┌────┼────┐
   ▼    ▼    ▼
 HTML  AST  其它导出
```

这意味着 Notedown 不只输出 HTML。它可以输出结构化 schema、scene、或者另一种 Markdown dialect——但语义始终是同一份。

## Notedown 接管 Markdown 之后

Doki 不再依赖 pulldown、marked 或 gray-matter。全部 Markdown 输入统一走 Notedown：

- front matter 解析：Notedown 处理，不是 gray-matter
- 内联 HTML：受控 raw HTML 块，不默认接受任意 `<script>`
- 扩展：通过 Notedown 语义层扩展，不用正则替换正文

## 对博客主题意味着什么

主题写作者不再需要猜测 Markdown 渲染细节。Notedown IR 提供稳定的结构约定：

- 任务列表有 `task: true/false` 字段
- 代码块带语言和可选元数据
- 链接、图片、表格的 span 可追溯
- 脚注和引用块有明确语义

模板层只消费这些稳定节点，不关心 parser 的具体实现。
