import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeDeployConfig } from './deploy.mjs'

const TEMPLATES_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'templates',
)

const REPO_PLUGINS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../plugins',
)
const REPO_THEMES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../themes',
)

/**
 * @param {string} targetDir
 * @param {{ template?: string }} [opts]
 */
export function createMinimalSite(targetDir, opts = {}) {
  return createSite(targetDir, opts.template || 'minimal')
}

/**
 * @param {string} targetDir
 * @param {string} templateName
 */
export function createSite(targetDir, templateName = 'minimal') {
  const root = path.resolve(targetDir)
  if (fs.existsSync(path.join(root, 'doki.toml'))) {
    throw new Error(`doki.toml already exists in ${root}`)
  }
  const templateRoot = path.join(TEMPLATES_ROOT, templateName)
  if (!fs.existsSync(templateRoot)) {
    const available = fs
      .readdirSync(TEMPLATES_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
    throw new Error(
      `unknown template \`${templateName}\`; available: ${available.join(', ')}`,
    )
  }
  fs.mkdirSync(root, { recursive: true })
  copyDir(templateRoot, root)

  if (templateName === 'blog') {
    vendorThemePlain(root)
    vendorOfficialPlugins(root, [
      ['plugin-sitemap', 'sitemap', '@doki-land/doki-plugin-sitemap'],
      ['plugin-robots', 'robots', '@doki-land/doki-plugin-robots'],
      ['plugin-feed', 'feed', '@doki-land/doki-plugin-feed'],
      ['plugin-search', 'search', '@doki-land/doki-plugin-search'],
    ])
    // Default static-host hint (netlify); overwrite-safe only if absent
    try {
      writeDeployConfig(root, 'netlify', { outputDir: 'dist' })
    } catch {
      /* already present */
    }
  }

  return { root, template: templateName }
}

function vendorThemePlain(root) {
  const themeSrc = path.join(REPO_THEMES, 'theme-plain')
  const themeDest = path.join(root, 'themes', 'plain')
  if (fs.existsSync(themeSrc)) {
    copyDir(themeSrc, themeDest)
  }
}

/**
 * @param {string} root
 * @param {Array<[string, string, string]>} plugins [srcDir, destName, packageId]
 */
function vendorOfficialPlugins(root, plugins) {
  for (const [srcName, destName, packageId] of plugins) {
    const pluginSrc = path.join(REPO_PLUGINS, srcName)
    const pluginDest = path.join(root, 'plugins', destName)
    if (!fs.existsSync(pluginSrc)) continue
    copyDir(pluginSrc, pluginDest)
    const pkgPath = path.join(pluginDest, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      delete pkg.dependencies
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    }
    const entry = path.join(pluginDest, 'index.js')
    if (fs.existsSync(entry)) {
      let src = fs.readFileSync(entry, 'utf8')
      src = src.replace(
        /import \{ definePlugin \} from '@doki-land\/plugin'\r?\n\r?\n/,
        'function definePlugin(p) { return p }\n\n',
      )
      src = src.replace(`id: '${packageId}'`, `id: './plugins/${destName}'`)
      fs.writeFileSync(entry, src)
    }
  }
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const src = path.join(from, entry.name)
    const dest = path.join(to, entry.name)
    if (entry.isDirectory()) {
      copyDir(src, dest)
    } else {
      fs.copyFileSync(src, dest)
    }
  }
}
