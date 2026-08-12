import fs from 'node:fs'
import path from 'node:path'

/** @typedef {'netlify' | 'vercel' | 'github' | 'cloudflare'} DeployPlatform */

export const SUPPORTED_PLATFORMS = /** @type {const} */ ([
  'netlify',
  'vercel',
  'github',
  'cloudflare',
])

/**
 * @param {string} platform
 * @returns {platform is DeployPlatform}
 */
export function isPlatformSupported(platform) {
  return SUPPORTED_PLATFORMS.includes(/** @type {DeployPlatform} */ (platform))
}

/**
 * @param {DeployPlatform} platform
 */
export function getConfigFilePath(platform) {
  switch (platform) {
    case 'netlify':
      return 'netlify.toml'
    case 'vercel':
      return 'vercel.json'
    case 'github':
      return '.github/workflows/deploy.yml'
    case 'cloudflare':
      return 'wrangler.toml'
    default:
      throw new Error(`unsupported platform: ${platform}`)
  }
}

/**
 * Deploy config generators — product entry is `doki deploy` (not a separate npm package).
 * @param {{ platform: DeployPlatform, outputDir?: string, nodeVersion?: string }} options
 */
export function generateDeployConfigContent(options) {
  const outputDir = options.outputDir || 'dist'
  const nodeVersion = options.nodeVersion || '20'
  switch (options.platform) {
    case 'netlify':
      return `[build]
  command = "doki build"
  publish = "${outputDir}"

[build.environment]
  NODE_VERSION = "${nodeVersion}"
`
    case 'vercel':
      return `${JSON.stringify(
        {
          buildCommand: 'doki build',
          outputDirectory: outputDir,
          framework: null,
        },
        null,
        2,
      )}\n`
    case 'github':
      return `name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: ${nodeVersion}
          cache: pnpm
      - run: pnpm install
      - run: pnpm exec doki build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ${outputDir}

  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
`
    case 'cloudflare':
      return `name = "doki-site"
compatibility_date = "2024-01-01"
pages_build_output_dir = "${outputDir}"
`
    default:
      throw new Error(`unsupported platform: ${options.platform}`)
  }
}

/**
 * Write deploy config into a project root.
 * @param {string} root
 * @param {DeployPlatform} platform
 * @param {{ outputDir?: string, nodeVersion?: string, force?: boolean }} [opts]
 */
export function writeDeployConfig(root, platform, opts = {}) {
  if (!isPlatformSupported(platform)) {
    throw new Error(
      `unsupported platform \`${platform}\`; use: ${SUPPORTED_PLATFORMS.join(', ')}`,
    )
  }
  const rel = getConfigFilePath(platform)
  const abs = path.join(root, rel)
  if (fs.existsSync(abs) && !opts.force) {
    throw new Error(`${rel} already exists (pass --force to overwrite)`)
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const content = generateDeployConfigContent({
    platform,
    outputDir: opts.outputDir || 'dist',
    nodeVersion: opts.nodeVersion,
  })
  fs.writeFileSync(abs, content)
  return { path: rel, absolute: abs }
}
