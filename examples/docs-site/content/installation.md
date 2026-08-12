---
title: "Installation"
description: "How to install Doki Engine"
section: "getting-started"
weight: 10
---

# Installation

This guide will walk you through the process of installing Doki Engine.

## Prerequisites

Before installing Doki Engine, make sure you have the following installed:

- **Node.js** (v14 or later)
  - Download from [nodejs.org](https://nodejs.org/)
  - Verify installation with `node --version`

- **pnpm** (v6 or later)
  - Install with `npm install -g pnpm`
  - Verify installation with `pnpm --version`

## Option 1: Install as a Development Dependency

The recommended way to install Doki Engine is as a development dependency in your project:

1. **Initialize a new project** (if you don't already have one)
   ```bash
   mkdir my-project
   cd my-project
   pnpm init
   ```

2. **Install Doki Engine**
   ```bash
   pnpm add -D doki-engine
   ```

3. **Add build scripts** to your `package.json`
   ```json
   {
     "scripts": {
       "build": "doki build",
       "serve": "doki serve"
     }
   }
   ```

## Option 2: Install Globally

You can also install Doki Engine globally to use it across multiple projects:

```bash
pnpm add -g doki-engine
```

Verify the installation:

```bash
doki --version
```

## Option 3: Install from Source

If you want to use the latest development version, you can install from source:

1. **Clone the repository**
   ```bash
   git clone https://github.com/doki-engine/doki-engine.git
   cd doki-engine
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Build the project**
   ```bash
   pnpm build
   ```

4. **Link the package** (optional)
   ```bash
   pnpm link --global
   ```

## Verifying the Installation

To verify that Doki Engine is installed correctly, run:

```bash
# If installed as a development dependency
npx doki --version

# If installed globally
doki --version
```

You should see the version number of Doki Engine.

## Troubleshooting

### Node.js Version Issues

If you get an error about Node.js version, make sure you're using Node.js v14 or later:

```bash
node --version
```

If you need to manage multiple Node.js versions, consider using [nvm](https://github.com/nvm-sh/nvm) or [nvs](https://github.com/jasongin/nvs).

### Permission Issues

If you get permission errors when installing globally, try using `sudo` (on macOS/Linux) or running the command prompt as administrator (on Windows):

```bash
# On macOS/Linux
sudo pnpm add -g doki-engine
```

### Network Issues

If you're having network issues, try using a different npm registry:

```bash
pnpm config set registry https://registry.npmmirror.com
pnpm add -D doki-engine
```

## Next Steps

Now that you've installed Doki Engine, you can:

1. **Create a new project** using `doki init`
2. **Build your site** using `doki build`
3. **Serve your site** using `doki serve`

For more information on how to use Doki Engine, check out the [Usage](usage) section.