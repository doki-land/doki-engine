---
title: "Usage"
description: "How to use Doki Engine"
section: "guide"
weight: 10
---

# Usage

This guide will show you how to use Doki Engine to build static websites.

## Configuration

### Configuration File

Doki Engine uses a `doki.toml` file for configuration. Here's a basic example:

```toml
[site]
title = "My Site"
description = "A site built with Doki Engine"
lang = "en"
author = "Your Name"

[build]
input_dir = "content"
output_dir = "dist"
static_dir = "static"
incremental = true

[template]
engine = "dejavu"
dir = "templates"
layout = "layout"
```

### Configuration Options

#### Site Configuration

- **title**: The title of your site
- **description**: A short description of your site
- **lang**: The language of your site (default: "en")
- **author**: The author of the site

#### Build Configuration

- **input_dir**: The directory containing your content files (default: "content")
- **output_dir**: The directory where the built site will be saved (default: "dist")
- **static_dir**: The directory containing static assets (default: "static")
- **incremental**: Whether to use incremental build (default: true)

#### Template Configuration

- **engine**: The template engine to use (default: "dejavu")
- **dir**: The directory containing template files (default: "templates")
- **layout**: The name of the default layout template (default: "layout")

## Content Management

### Content Files

Content files are written in Markdown with YAML front matter. Here's an example:

```markdown
---
title: "My First Post"
description: "This is my first post"
date: 2026-03-18
tags: ["blog", "tutorial"]
---

# My First Post

This is the content of my first post.
```

### Front Matter

Front matter is used to define metadata for your content. Common front matter fields include:

- **title**: The title of the content
- **description**: A short description of the content
- **date**: The date of the content
- **tags**: An array of tags for the content
- **layout**: The layout template to use for this content

### Content Organization

You can organize your content into subdirectories:

```
content/
├── posts/
│   ├── post-1.md
│   └── post-2.md
├── pages/
│   ├── about.md
│   └── contact.md
└── index.md
```

## Template System

### Layout Templates

Layout templates define the overall structure of your pages. Here's an example `layout.html.dejavu`:

```html
<!DOCTYPE html>
<html lang="<% site.lang %>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><% page.title %> - <% site.title %></title>
    <meta name="description" content="<% page.description || site.description %>">
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <header>
        <div class="container">
            <h1><a href="/"><% site.title %></a></h1>
            <nav>
                <ul>
                    <li><a href="/">Home</a></li>
                    <li><a href="/about">About</a></li>
                </ul>
            </nav>
        </div>
    </header>
    <main>
        <div class="container">
            <% block content %><% end block %>
        </div>
    </main>
    <footer>
        <div class="container">
            <p>&copy; <% now |> date: "%Y" %> <% site.author %>. All rights reserved.</p>
        </div>
    </footer>
</body>
</html>
```

### Page Templates

Page templates extend layout templates and define the content area. Here's an example `page.html.dejavu`:

```html
<% extends "layout.html.dejavu" %>

<% block content %>
    <article>
        <h1><% page.title %></h1>
        <div class="content">
            <% content |> safe %>
        </div>
    </article>
<% end block %>
```

### Template Variables

Common template variables include:

- **site**: Site configuration (title, description, etc.)
- **page**: Current page content and metadata
- **now()**: Function to get the current date
- **date()**: Filter to format dates
- **paginate()**: Function to paginate content
- **categories**: List of content categories
- **tags**: List of content tags

## Static Assets

Static assets like CSS, JavaScript, and images should be placed in the `static` directory:

```
static/
├── css/
│   └── style.css
├── js/
│   └── main.js
└── images/
    └── logo.png
```

These assets can be referenced in your templates:

```html
<link rel="stylesheet" href="/css/style.css">
<script src="/js/main.js"></script>
<img src="/images/logo.png" alt="Logo">
```

## Commands

### `doki init`

Initialize a new Doki Engine project:

```bash
doki init [directory]
```

### `doki build`

Build your static site:

```bash
doki build [options]
```

Options:
- `--config <path>`: Path to the configuration file
- `--output <dir>`: Output directory
- `--watch`: Watch for changes and rebuild automatically

### `doki serve`

Serve your static site locally:

```bash
doki serve [options]
```

Options:
- `--port <port>`: Port to serve on (default: 8080)
- `--host <host>`: Host to serve on (default: localhost)

### `doki clean`

Clean the build directory:

```bash
doki clean
```

## Plugins

### Creating Plugins

Plugins can be used to extend Doki Engine's functionality. Here's an example plugin:

```javascript
// plugins/my-plugin.js
module.exports = {
    meta: {
        name: 'my-plugin',
        version: '1.0.0',
        description: 'My custom plugin'
    },
    hooks: {
        beforeBuild: (context) => {
            console.log('Building site...');
            return context;
        },
        afterBuild: (context) => {
            console.log('Site built successfully!');
            return context;
        }
    }
};
```

### Configuring Plugins

To use a plugin, add it to your `doki.toml`:

```toml
[plugins]
my-plugin = {
    path = "plugins/my-plugin.js"
}
```

## Themes

### Using Themes

Themes can be used to change the look and feel of your site. To use a theme, add it to your `doki.toml`:

```toml
[theme]
name = "my-theme"
path = "themes/my-theme"
```

### Creating Themes

A theme consists of templates and static assets:

```
themes/my-theme/
├── templates/
│   ├── layout.html.dejavu
│   ├── index.html.dejavu
│   └── page.html.dejavu
├── static/
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── main.js
└── theme.toml
```

## Advanced Usage

### Pagination

Use the `paginate` function to paginate content:

```html
<% loop post in paginate("posts", 10) %>
    <article>
        <h2><a href="<% post.url %>"><% post.title %></a></h2>
        <p><% post.excerpt %></p>
    </article>
<% end loop %>

<div class="pagination">
    <% if paginator.has_prev %>
        <a href="<% paginator.prev_url %>">Previous</a>
    <% end if %>
    <span><% paginator.page %> / <% paginator.total_pages %></span>
    <% if paginator.has_next %>
        <a href="<% paginator.next_url %>">Next</a>
    <% end if %>
</div>
```

### Categories and Tags

Access categories and tags in your templates:

```html
<h2>Categories</h2>
<ul>
    <% loop category in categories %>
        <li>
            <a href="<% category.url %>"><% category.name %></a>
            <span>(<% category.posts |> length %>)</span>
        </li>
    <% end loop %>
</ul>

<h2>Tags</h2>
<ul>
    <% loop tag in tags %>
        <li>
            <a href="<% tag.url %>"><% tag.name %></a>
            <span>(<% tag.posts |> length %>)</span>
        </li>
    <% end loop %>
</ul>
```

### Custom Filters

Add custom filters using plugins:

```javascript
// plugins/filters.js
module.exports = {
    meta: {
        name: 'filters',
        version: '1.0.0'
    },
    hooks: {
        addFilters: (filters) => {
            filters.uppercase = (value) => {
                return value.toUpperCase();
            };
            return filters;
        }
    }
};
```

Use the filter in your templates:

```html
<p><% page.title |> uppercase %></p>
```

## Conclusion

This guide has covered the basic usage of Doki Engine. For more advanced features and API documentation, check out the [API Reference](api-reference) section.