---
title: Dejavu 模板语言概览
date: 2025-08-10
description: Dejavu 的语法、宏、继承和受控能力边界。为什么它只有一个 slot。
tags: [技术, Dejavu]
cover: assets/post-dejavu.jpg
---

## 单 slot 设计

Dejavu 最显眼的决定：**只有一个定界符 slot**。`.doki` 用 `{% %}`，`.dejavu` 用 `<% %>`。语句和表达式在同一个 `{% ... %}` 里，用关键词区分。

```
{% if page.title %}{% page.title |> escape %}{% end if %}
```

- `if` 是语句关键词
- `page.title |> escape` 是表达式
- 没有 `{{ expr }}`、`<%= expr %>` 专用输出入口

这让代码块结构更紧凑，也避免了多定界符切换时的心智负担。

## 宏

```
{% macro card(title, body) %}
  <section class="card">
    <h2>{{ title }}</h2>
    <p>{{ body }}</p>
  </section>
{% end macro %}
```

调用：

```
{% card("Hello", "Fate") %}
```

参数是显式的，不接受任意位置扩展。caller 形式在需要"把一段模板当参数传入"时使用。

## 继承

```
{% extends "layouts/base" %}

{% block content %}
  <p>This goes into base.content</p>
{% end block %}
```

多层继承链上，`super` 调用上一层的同名 block。

## 受控能力

Dejavu 的 registry 只暴露**显式注册**的 filter、macro 和能力。模板里不能读任意文件、不能发起网络请求、不能调用任意宿主方法。

安全模型简单：模板层就是一个 sandbox，想要更多能力？写插件，在宿主层注册。

## 还缺什么

- 循环元数据（index / first / last）
- `break` / `continue`
- context-sensitive escaping
- async / streaming

这些都在路线上，不在这里重复排期。
