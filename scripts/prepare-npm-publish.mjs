#!/usr/bin/env node
/**
 * Prep package.json for npm publish (current Doki entry surface).
 * Does not prepare private compilers/* trees.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JS_PACKAGES, PLATFORM_PACKAGES, NAPI_BUILD } from './doki-release-packages.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = 'https://github.com/doki-land/doki-engine.git'

function prepare(file, directory) {
  const json = JSON.parse(readFileSync(file, 'utf8'))
  json.publishConfig = {
    ...(json.publishConfig ?? {}),
    access: 'public',
    registry: 'https://registry.npmjs.org/',
  }
  json.repository = {
    type: 'git',
    url: REPO,
    directory,
  }
  if (json.private) delete json.private
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
  console.log(`prepared ${json.name}@${json.version}`)
}

for (const pkg of JS_PACKAGES) {
  prepare(join(root, pkg.path, 'package.json'), pkg.directory)
}

for (const plat of PLATFORM_PACKAGES) {
  const file = join(root, NAPI_BUILD.npmRoot, plat.npmDir, 'package.json')
  if (!existsSync(file)) continue
  prepare(file, `${NAPI_BUILD.npmRoot}/${plat.npmDir}`)
}
