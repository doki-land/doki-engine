# 🎨 Doki Default Theme

Default theme for Doki Engine — clean layouts for blogs and docs.

## ✨ Features

- 🎨 Minimal modern look
- 📱 Responsive layout
- 🌙 Light / dark via `prefers-color-scheme`
- 📊 Semantic HTML for SEO
- ⚡ Small CSS footprint

## 📁 Layout

```
default/
├── templates/
│   ├── layout.html
│   ├── index.html
│   ├── page.html
│   └── post.html
├── static/css/style.css
├── package.json
└── theme.toml
```

## 🚀 Usage

```toml
# doki.toml
[theme]
name = "default"
```

```bash
pnpm add @doki/theme-default
```

## 📝 Templates

Filter pipe is **`|>`**. Delimiters are `{% %}` / `{# #}`. Closers: `end if` / `end loop` / `end block`.

### layout.html

```html
<!DOCTYPE html>
<html lang="{% site.lang %}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{% site.title %}{% if page.title %} - {% page.title %}{% end if %}</title>
  <link rel="stylesheet" href="/static/css/style.css">
</head>
<body>
  <header>
    <nav>
      <a href="/" class="logo">{% site.title %}</a>
    </nav>
  </header>
  <main>
    {% block content %}{% end block %}
  </main>
  <footer>
    <p>&copy; {% now |> date: '%Y' %} {% site.author %}</p>
  </footer>
</body>
</html>
```

### index.html

```html
{% extends "layout.html" %}
{% block content %}
<section class="posts">
  {% loop post in pages %}
  <article>
    <h2><a href="{% post.url %}">{% post.title %}</a></h2>
    <time>{% post.date |> date: '%Y-%m-%d' %}</time>
    <p>{% post.description %}</p>
  </article>
  {% end loop %}
</section>
{% end block %}
```

### post.html

```html
{% extends "layout.html" %}
{% block content %}
<article class="post">
  <header>
    <h1>{% page.title %}</h1>
    <time>{% page.date |> date: '%Y-%m-%d' %}</time>
  </header>
  <div class="content">
    {% content |> raw %}
  </div>
</article>
{% end block %}
```

## 🎨 Styling

Override CSS variables:

```css
:root {
  --color-primary: #3b82f6;
  --color-text: #1f2937;
  --color-background: #ffffff;
}
```

## ⚙️ theme.toml

```toml
name = "default"
version = "1.0.0"
description = "Default theme for Doki Engine"
author = "Doki Engine"
license = "MIT"

[settings]
paginate = 10
date_format = "%Y-%m-%d"
```

## 📦 Context variables

| Variable | Meaning |
| --- | --- |
| `site.title` / `site.url` / `site.author` | Site metadata |
| `page.title` / `page.date` / `page.url` | Page metadata |
| `content` | Rendered body |
| `posts` / `pages` / `tags` / `categories` | Collections |

## 📄 License

MIT License © Doki Land
