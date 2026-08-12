---
title: "About"
description: "About this static site example"
---

# About This Site

This is a static site example built with Doki Engine, demonstrating the basic features of the static site generator.

## What is Doki Engine?

Doki Engine is a static site generator based on Dejavu Engine, providing a complete build process from templates to static HTML. It is designed to be simple, fast, and flexible, making it easy to create static websites of all sizes.

## Features Used in This Example

- **Markdown Content**: Using Markdown files for content with YAML front matter for metadata
- **Template System**: Using Dejavu templates with layout inheritance
- **Static Assets**: Including CSS files for styling
- **Development Tools**: Using the built-in development server for live preview

## How to Use This Example

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Build the Site**
   ```bash
   pnpm build
   ```

3. **Serve the Site**
   ```bash
   pnpm serve
   ```

4. **Modify the Content**
   - Edit files in the `content` directory to change the site content
   - Edit files in the `templates` directory to change the site layout
   - Edit files in the `static` directory to add static assets

## Project Structure

```
static-site/
├── content/           # Content files (Markdown)
├── templates/         # Template files (Dejavu)
├── static/            # Static assets (CSS, JS, images)
├── doki.toml         # Configuration file
└── package.json       # Project configuration
```

## Conclusion

This example demonstrates how easy it is to create a static site with Doki Engine. With its simple configuration and powerful features, Doki Engine is a great choice for creating static websites of all types and sizes.