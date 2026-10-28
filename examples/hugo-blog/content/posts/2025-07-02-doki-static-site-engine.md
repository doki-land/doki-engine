---
title: Doki 静态站点引擎简介
date: 2025-07-02
slug: doki-static-site-engine
description: Doki 是什么、它为什么又建在 Dejavu 之上，以及和常见静态站点生成器的差别。
tags: [技术, Doki]
cover: assets/post-doki.jpg
---

## Doki 是什么

Doki 是一个**可配置模板定界符的静态站点引擎**。它把页面、布局、组件和内容一起编译，输出纯静态资源，运行时不再加载模板。

## 与 Dejavu 的关系

Dejavu 是模板语言本身——定义语法、宏、继承、受控能力边界。Doki 是站点层：文件系统、路由、集合、主题、资源构建、插件。

简单说：

```
内容 + Dejavu 模板 + 站点配置
           │
           ▼
         Doki
           │
           ▼
     纯静态 HTML / CSS / 图片
```

## 和 Hexo / Hugo 的差别（节选）

| 关注点 | Doki | Hexo / Hugo |
| ------ | ---- | ----------- |
| 模板引擎 | Dejavu（自研、受控 registry） | Swig / Go Template |
| Markdown | Notedown | 各自主链 + 插件生态 |
| 构建 | AOT，产物无 runtime 依赖 | 各自 AOT |
| 能力边界 | 模板层不开放任意 fs / 网络 | 视插件而定 |

> 这里只是列差别，不是比较优劣。每个工具都有自己的取舍。

## 一个最小站点长这样

```
my-site/
├── content/
│   ├── index.md
│   └── posts/
│       └── hello.md
├── themes/
│   └── fate/
└── doki.toml
```

运行：

```bash
doki build
doki serve
```

## 下一步

这只是简介。接下来会写：

1. Dejavu 模板语言的宏和继承
2. Notedown 如何接管 Markdown
3. Doki 的集合、路由和主题机制
