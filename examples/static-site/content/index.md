---
title: "Home"
description: "Welcome to the static site example"
---

# Static Site Example

Welcome to the static site example built with Doki Engine!

## What is Doki Engine?

Doki Engine is a static site generator based on Dejavu Engine, providing a complete build process from templates to static HTML.

## Features

- **Template System**: Based on Dejavu Engine, supporting template inheritance and includes
- **Content Processing**: Supports Markdown content files with metadata extraction
- **Static Site Generation**: Automatically generates site structure and static HTML files
- **Development Tools**: Local development server with live preview
- **Extensibility**: Plugin system for custom functionality

## Getting Started

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

## Project Structure

```
static-site/
├── content/           # Content files
├── templates/         # Template files
├── static/            # Static assets
├── doki.toml         # Configuration file
└── package.json       # Project configuration
```

## Example Pages

- [Home](/) - This page
- [About](/about) - About page

## Conclusion

This static site example demonstrates the basic features of Doki Engine. You can use it as a starting point for your own static site projects.