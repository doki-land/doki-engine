import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Load the N-API binding shipped inside `@doki-land/doki` (or workspace sibling).
 * There is no user-facing `@doki-land/doki-core` package.
 */
export async function loadCore() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const require = createRequire(import.meta.url)
  const candidates = [
    path.resolve(here, '../../doki-core/index.js'), // monorepo build output (CJS, no type:module)
    path.resolve(here, '../native/index.cjs'), // published @doki-land/doki
  ]

  let mod
  let lastErr
  for (const candidate of candidates) {
    try {
      mod = require(candidate)
      break
    } catch (err) {
      lastErr = err
    }
  }
  if (!mod) {
    throw new Error(
      `failed to load Doki native binding (${lastErr?.message ?? 'unknown'}). Run: cd compilers/doki-node && npm run build`,
    )
  }

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
  return mod
}
