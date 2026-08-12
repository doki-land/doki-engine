import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Prefer project-local `@doki-land/doki` when this process is not already that package.
 * @param {string} root
 * @param {string[]} argv original argv (without node/bin)
 * @returns {Promise<boolean>} true if handed off
 */
export async function tryHandoffToProjectLocal(root, argv) {
  const { createRequire } = await import('node:module')
  const { spawn } = await import('node:child_process')

  let require
  try {
    require = createRequire(path.join(root, 'package.json'))
  } catch {
    return false
  }

  let localEntry
  try {
    localEntry = require.resolve('@doki-land/doki/package.json')
  } catch {
    return false
  }

  const localPkgDir = path.dirname(localEntry)
  const thisPkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

  if (path.resolve(thisPkgDir) === path.resolve(localPkgDir)) {
    return false
  }

  const bin = path.join(localPkgDir, 'bin', 'doki.js')
  if (!fs.existsSync(bin)) {
    console.warn(
      `project has @doki-land/doki but missing bin at ${bin}; continuing with current CLI`,
    )
    return false
  }

  console.error(`using project-local @doki-land/doki (${localPkgDir})`)
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...argv, '--allow-global'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env,
    })
    child.on('exit', (c) => resolve(c ?? 1))
  })
  if (code !== 0) process.exit(code)
  return true
}
