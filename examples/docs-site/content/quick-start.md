---
title: "Quick Start"
description: "Get started with Doki Engine quickly"
section: "getting-started"
weight: 20
---

# Quick Start

This guide will help you get started with Doki Engine quickly.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js** (v14 or later)
- **pnpm** (v6 or later)

## Step 1: Initialize a New Project

1. **Create a new directory for your project**
   ```bash
   mkdir my-doki-project
   cd my-doki-project
   ```

2. **Initialize a new Doki Engine project**
   ```bash
   pnpm init
   pnpm add -D doki-engine
   ```

3. **Create a basic project structure**
   ```bash
   mkdir -p content templates static
   ```

## Step 2: Create Configuration File

Create a `doki.toml` file in the root directory:

```toml
[site]
title = "My Doki Site"
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

## Step 3: Create Templates

1. **Create a layout template** (`templates/layout.html.dejavu`):

   ```html
   <!DOCTYPE html>
   <html lang="{{ site.lang }}">
   <head>
       <meta charset="UTF-8">
       <meta name="viewport" content="width=device-width, initial-scale=1.0">
       <title>{{ page.title }} - {{ site.title }}</title>
       <meta name="description" content="{{ page.description or site.description }}">
       <link rel="stylesheet" href="/css/style.css">
   </head>
   <body>
       <header>
           <div class="container">
               <h1><a href="/">{{ site.title }}</a></h1>
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
               <% block content %><% endblock %>
           </div>
       </main>
       <footer>
           <div class="container">
               <p>&copy; {% now |> date: "%Y" %} {% site.author %}. All rights reserved.</p>
           </div>
       </footer>
   </body>
   </html>
   ```

2. **Create an index template** (`templates/index.html.dejavu`):

   ```html
   <% extends "layout.html.dejavu" %>

   <% block content %>
       <article>
           <h1>{{ page.title }}</h1>
           <div class="content">
               {{ page.content }}
           </div>
       </article>
   <% endblock %>
   ```

3. **Create a page template** (`templates/page.html.dejavu`):

   ```html
   <% extends "layout.html.dejavu" %>

   <% block content %>
       <article>
           <h1>{{ page.title }}</h1>
           <div class="content">
               {{ page.content }}
           </div>
       </article>
   <% endblock %>
   ```

## Step 4: Create Content Files

1. **Create a home page** (`content/index.md`):

   ```markdown
   ---
title: "Home"
description: "Welcome to my Doki site"
---

# Welcome to My Doki Site

This is a simple site built with Doki Engine.
   ```

2. **Create an about page** (`content/about.md`):

   ```markdown
   ---
title: "About"
description: "About this site"
---

# About This Site

This site was built with Doki Engine and Dejavu templates.
   ```

## Step 5: Create Static Assets

1. **Create a CSS file** (`static/css/style.css`):

   ```css
   /* Basic styles */
   body {
       font-family: Arial, sans-serif;
       line-height: 1.6;
       color: #333;
       margin: 0;
       padding: 0;
   }

   .container {
       max-width: 800px;
       margin: 0 auto;
       padding: 20px;
   }

   header {
       background: #333;
       color: #fff;
       padding: 10px 0;
   }

   header a {
       color: #fff;
       text-decoration: none;
   }

   nav ul {
       list-style: none;
       padding: 0;
   }

   nav ul li {
       display: inline;
       margin-right: 10px;
   }

   main {
       padding: 20px 0;
   }

   footer {
       background: #333;
       color: #fff;
       text-align: center;
       padding: 10px 0;
       margin-top: 20px;
   }
   ```

## Step 6: Build and Serve the Site

1. **Build the site**
   ```bash
   npx doki build
   ```

2. **Serve the site**
   ```bash
   npx doki serve
   ```

3. **Open your browser** and navigate to `http://localhost:8080` to see your site.

## Conclusion

You've successfully created a basic site with Doki Engine! This is just the beginning - you can now explore more advanced features like:

- **Custom Plugins**: Extend Doki Engine with custom functionality
- **Themes**: Create or use pre-built themes
- **Advanced Templates**: Use more complex template features
- **Content Organization**: Organize your content with categories and tags

For more information, check out the [Installation](installation) and [Usage](usage) sections of this documentation.