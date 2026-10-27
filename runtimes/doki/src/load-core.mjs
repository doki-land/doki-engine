import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Load the N-API binding for Doki.
 *
 * Resolution order (matches Dejavu napi.ts pattern):
 *   1. Env override `DOKI_NATIVE_NODE` (absolute or relative to cwd).
 *   2. Platform-specific optional dependency package — the normal packed-
 *      closure / published path. Resolved via `require.resolve` against the
 *      matching `@doki-land/doki-<os>-<cpu>` package.
 *   3. Monorepo sibling — `../../doki-core/index.js` (workspace dev build).
 *   4. Published stub — `../native/index.cjs` (fallback for hand-built dist).
 *
 * The platform package names match `doki-release-packages.mjs` PLATFORM_PACKAGES
 * (no `-gnu` / `-msvc` suffix on the npm package name).
 */

const PLATFORM_PACKAGES = {
  'linux-x64': '@doki-land/doki-linux-x64',
  'linux-arm64': '@doki-land/doki-linux-arm64',
  'darwin-x64': '@doki-land/doki-darwin-x64',
  'darwin-arm64': '@doki-land/doki-darwin-arm64',
  'win32-x64': '@doki-land/doki-win32-x64',
  'win32-arm64': '@doki-land/doki-win32-arm64',
}

let cached

export async function loadCore() {
  if (cached) return cached

  const here = path.dirname(fileURLToPath(import.meta.url))
  const require = createRequire(import.meta.url)

  // 1. Env override
  const override = process.env.DOKI_NATIVE_NODE
  if (override) {
    const resolved = path.isAbsolute(override) ? override : path.resolve(override)
    if (existsSync(resolved)) {
      cached = require(resolved)
      _validate(cached)
      return cached
    }
  }

  // 2. Platform optional dependency package
  const key = `${process.platform}-${process.arch}`
  const pkg = PLATFORM_PACKAGES[key]
  if (pkg) {
    try {
      const pkgJson = require.resolve(`${pkg}/package.json`)
      const pkgDir = path.dirname(pkgJson)
      const meta = require(pkgJson)
      const addon = path.join(pkgDir, meta.main ?? 'index.node')
      if (existsSync(addon)) {
        cached = require(addon)
        _validate(cached)
        return cached
      }
    } catch {
      // package not installed or no .node — fall through to local candidates
    }
  }

  // 3. Monorepo sibling build output
  const candidates = [
    path.resolve(here, '../../doki-core/index.js'),
    path.resolve(here, '../native/index.cjs'),
  ]

  let lastErr
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    try {
      cached = require(candidate)
      _validate(cached)
      return cached
    } catch (err) {
      lastErr = err
    }
  }

  const supported = Object.keys(PLATFORM_PACKAGES).join(', ')
  throw new Error(
    `failed to load Doki native binding. Platform ${key} maps to ${pkg ?? '(not supported)'}. ` +
      `Install the matching optional dep or set DOKI_NATIVE_NODE. ` +
      `Supported: ${supported}. ` +
      `Run: cd compilers/doki-node && npm run build`,
  )
}

function _validate(mod) {
  const required = [
    'openProject',
    'prepareBuild',
    'continueBuild',
    'commitBuild',
    'setResolvedExtensions',
    'explainRebuild',
    'inspect',
    'dispose',
    'peekTheme',
    'findThemeDefaults',
  ]
  for (const k of required) {
    if (typeof mod[k] !== 'function') {
      throw new Error(
        `Doki native binding missing ${k}; rebuild with: cd compilers/doki-node && npm run build`,
      )
    }
  }
}
