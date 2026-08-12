---
title: "API Reference"
description: "API documentation for Doki Engine"
section: "reference"
weight: 10
---

# API Reference

This page provides API documentation for Doki Engine, including the command-line API and JavaScript API.

## Command-Line API

### `doki init`

Initialize a new Doki Engine project.

**Usage:**
```bash
doki init [directory]
```

**Options:**
- `directory`: The directory to initialize the project in (default: current directory)

**Example:**
```bash
doki init my-site
```

### `doki build`

Build your static site.

**Usage:**
```bash
doki build [options]
```

**Options:**
- `--config <path>`: Path to the configuration file (default: `doki.toml`)
- `--output <dir>`: Output directory (overrides config)
- `--watch`: Watch for changes and rebuild automatically
- `--verbose`: Enable verbose output

**Example:**
```bash
doki build --config custom.toml --output public
```

### `doki serve`

Serve your static site locally.

**Usage:**
```bash
doki serve [options]
```

**Options:**
- `--port <port>`: Port to serve on (default: 8080)
- `--host <host>`: Host to serve on (default: localhost)
- `--config <path>`: Path to the configuration file

**Example:**
```bash
doki serve --port 3000 --host 0.0.0.0
```

### `doki clean`

Clean the build directory.

**Usage:**
```bash
doki clean
```

**Example:**
```bash
doki clean
```

## JavaScript API

### `DokiEngine` Class

The main class for using Doki Engine programmatically.

**Constructor:**
```javascript
const { DokiEngine } = require('doki-engine');

const engine = new DokiEngine(config);
```

**Parameters:**
- `config`: An object containing configuration options, or a path to a configuration file

**Methods:**

#### `build()`

Build the static site.

**Returns:**
- A Promise that resolves when the build is complete

**Example:**
```javascript
async function buildSite() {
    const engine = new DokiEngine('doki.toml');
    await engine.build();
    console.log('Site built successfully!');
}

buildSite();
```

#### `serve(options)`

Serve the static site locally.

**Parameters:**
- `options`: An object with the following properties:
  - `port`: Port to serve on (default: 8080)
  - `host`: Host to serve on (default: localhost)

**Returns:**
- A Promise that resolves when the server starts

**Example:**
```javascript
async function serveSite() {
    const engine = new DokiEngine('doki.toml');
    await engine.serve({ port: 3000 });
    console.log('Server started on http://localhost:3000');
}

serveSite();
```

#### `clean()`

Clean the build directory.

**Returns:**
- A Promise that resolves when the cleaning is complete

**Example:**
```javascript
async function cleanSite() {
    const engine = new DokiEngine('doki.toml');
    await engine.clean();
    console.log('Build directory cleaned!');
}

cleanSite();
```

### `DokiConfig` Class

A class for loading and managing configuration.

**Constructor:**
```javascript
const { DokiConfig } = require('doki-engine');

const config = new DokiConfig(options);
```

**Parameters:**
- `options`: An object containing configuration options

**Static Methods:**

#### `fromFile(path)`

Load configuration from a file.

**Parameters:**
- `path`: Path to the configuration file

**Returns:**
- A Promise that resolves to a DokiConfig instance

**Example:**
```javascript
async function loadConfig() {
    const config = await DokiConfig.fromFile('doki.toml');
    console.log('Configuration loaded:', config);
}

loadConfig();
```

**Instance Methods:**

#### `validate()`

Validate the configuration.

**Returns:**
- A Promise that resolves if the configuration is valid, or rejects with an error

**Example:**
```javascript
async function validateConfig() {
    const config = await DokiConfig.fromFile('doki.toml');
    await config.validate();
    console.log('Configuration is valid!');
}

validateConfig();
```

### Plugin API

Plugins can be created to extend Doki Engine's functionality.

**Plugin Structure:**
```javascript
module.exports = {
    meta: {
        name: 'plugin-name',
        version: '1.0.0',
        description: 'Plugin description'
    },
    hooks: {
        beforeBuild: (context) => {
            // Code to run before building
            return context;
        },
        afterBuild: (context) => {
            // Code to run after building
            return context;
        },
        addFilters: (filters) => {
            // Add custom filters
            return filters;
        },
        addFunctions: (functions) => {
            // Add custom functions
            return functions;
        }
    }
};
```

**Hooks:**
- `beforeBuild(context)`: Run before building the site
- `afterBuild(context)`: Run after building the site
- `addFilters(filters)`: Add custom template filters
- `addFunctions(functions)`: Add custom template functions

**Context Object:**
The context object passed to hooks contains:
- `config`: The current configuration
- `content`: The site content
- `templates`: The site templates
- `outputDir`: The output directory

### Theme API

Themes can be created to change the look and feel of your site.

**Theme Structure:**
```
theme-name/
├── templates/         # Template files
├── static/            # Static assets
└── theme.toml         # Theme configuration
```

**Theme Configuration (`theme.toml`):**
```toml
name = "Theme Name"
description = "Theme description"
author = "Theme author"
version = "1.0.0"

[templates]
layout = "layout"

[static]
dir = "static"
```

## TypeScript Types

Doki Engine provides TypeScript types for better type safety.

### Configuration Types

```typescript
interface SiteConfig {
    title: string;
    description: string;
    lang?: string;
    author?: string;
}

interface BuildConfig {
    inputDir: string;
    outputDir: string;
    staticDir: string;
    incremental?: boolean;
}

interface TemplateConfig {
    engine: string;
    dir: string;
    layout: string;
}

interface DokiConfig {
    site: SiteConfig;
    build: BuildConfig;
    template: TemplateConfig;
    plugins?: Record<string, PluginConfig>;
    theme?: ThemeConfig;
}
```

### Plugin Types

```typescript
interface PluginMeta {
    name: string;
    version: string;
    description?: string;
}

interface PluginHooks {
    beforeBuild?: (context: BuildContext) => BuildContext | Promise<BuildContext>;
    afterBuild?: (context: BuildContext) => BuildContext | Promise<BuildContext>;
    addFilters?: (filters: Record<string, FilterFunction>) => Record<string, FilterFunction>;
    addFunctions?: (functions: Record<string, TemplateFunction>) => Record<string, TemplateFunction>;
}

interface Plugin {
    meta: PluginMeta;
    hooks: PluginHooks;
}
```

## Error Handling

Doki Engine provides error classes for better error handling.

### `DokiError`

The base error class for all Doki Engine errors.

**Properties:**
- `message`: The error message
- `name`: The error name
- `stack`: The error stack

### `ConfigError`

An error related to configuration.

### `BuildError`

An error related to building the site.

### `TemplateError`

An error related to templates.

### `ContentError`

An error related to content.

## Example Usage

### Basic Usage

```javascript
const { DokiEngine } = require('doki-engine');

async function buildSite() {
    try {
        const engine = new DokiEngine('doki.toml');
        await engine.build();
        console.log('Site built successfully!');
    } catch (error) {
        console.error('Error building site:', error);
    }
}

buildSite();
```

### Advanced Usage

```javascript
const { DokiEngine, DokiConfig } = require('doki-engine');

async function buildSite() {
    try {
        // Load and validate configuration
        const config = await DokiConfig.fromFile('doki.toml');
        await config.validate();

        // Create engine instance
        const engine = new DokiEngine(config);

        // Build the site
        await engine.build();

        // Serve the site
        await engine.serve({ port: 3000 });

        console.log('Site built and served successfully!');
    } catch (error) {
        console.error('Error:', error);
    }
}

buildSite();
```

## Conclusion

This API reference provides a comprehensive overview of Doki Engine's API. For more information on how to use these APIs, check out the [Usage](usage) section.