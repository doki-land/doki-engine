import fs from 'node:fs'
import path from 'node:path'

/**
 * Walk up from `start` until a directory containing `doki.toml` is found.
 * @param {string} start
 * @returns {string | null}
 */
export function findProjectRoot(start) {
  let dir = path.resolve(start)
  for (;;) {
    if (fs.existsSync(path.join(dir, 'doki.toml'))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}
