#!/usr/bin/env node
/**
 * Copy N-API loader into @doki-land/doki before pack/publish.
 * Must be `.cjs` because the facade package.json has "type": "module".
 */
import { copyFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NAPI_BUILD } from './doki-release-packages.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, NAPI_BUILD.path)
const destDir = join(root, 'runtimes/doki/native')

for (const file of ['index.js', 'index.d.ts']) {
  const from = join(srcDir, file)
  if (!existsSync(from)) {
    throw new Error(
      `missing ${from}; run: cd ${NAPI_BUILD.path} && npm run build`,
    )
  }
}

mkdirSync(destDir, { recursive: true })
copyFileSync(join(srcDir, 'index.js'), join(destDir, 'index.cjs'))
copyFileSync(join(srcDir, 'index.d.ts'), join(destDir, 'index.d.ts'))
writeFileSync(
  join(destDir, 'package.json'),
  `${JSON.stringify({ type: 'commonjs', main: 'index.cjs', types: 'index.d.ts' }, null, 2)}\n`,
)
console.log(`staged native loader → runtimes/doki/native/index.cjs`)
