import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doki-core-pack-'))

const pack = spawnSync('npm', ['pack', '--pack-destination', tmp], {
  cwd: pkgDir,
  encoding: 'utf8',
  shell: true,
})
if (pack.status !== 0) {
  console.error(pack.stdout)
  console.error(pack.stderr)
  process.exit(pack.status ?? 1)
}

const out = `${pack.stdout || ''}\n${pack.stderr || ''}`
const match = out.match(/doki-land-doki-core-[\d.]+(?:-[\w.]+)?\.tgz/) || out.match(/[\w@.-]+\.tgz/)
const tgzName = match?.[0]
if (!tgzName) {
  console.error('npm pack produced no tarball name')
  console.error(out)
  process.exit(1)
}
const tgz = path.join(tmp, tgzName)
if (!fs.existsSync(tgz)) {
  // npm pack may print only the basename on the last non-notice line
  const alt = fs.readdirSync(tmp).find((f) => f.endsWith('.tgz'))
  if (!alt) {
    console.error(`missing tarball: ${tgz}`)
    console.error(out)
    process.exit(1)
  }
  fs.renameSync(path.join(tmp, alt), tgz)
}

const extractDir = path.join(tmp, 'extract')
fs.mkdirSync(extractDir)
const extract = spawnSync(
  process.platform === 'win32' ? 'tar.exe' : 'tar',
  ['-xzf', tgz, '-C', extractDir],
  { encoding: 'utf8' },
)

const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
if (!pkgJson.optionalDependencies?.['@doki-land/doki-win32-x64']) {
  console.error('package.json missing optionalDependencies platform matrix')
  process.exit(1)
}
if (!pkgJson.optionalDependencies?.['@doki-land/doki-linux-x64-musl']) {
  console.error('package.json missing musl optionalDependencies')
  process.exit(1)
}

if (extract.status === 0) {
  const pkgRoot = path.join(extractDir, 'package')
  for (const required of ['index.js', 'index.d.ts', 'package.json']) {
    if (!fs.existsSync(path.join(pkgRoot, required))) {
      console.error(`tarball missing ${required}`)
      process.exit(1)
    }
  }
  const packed = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'))
  if (!packed.optionalDependencies?.['@doki-land/doki-win32-x64']) {
    console.error('packed package.json missing optionalDependencies')
    process.exit(1)
  }
} else {
  // Fallback: dry-run listing (npm writes notices to stderr)
  const listing = spawnSync('npm', ['pack', '--dry-run'], {
    cwd: pkgDir,
    encoding: 'utf8',
    shell: true,
  })
  const listed = `${listing.stdout || ''}\n${listing.stderr || ''}`
  for (const needle of ['index.js', 'index.d.ts', 'package.json']) {
    if (!listed.includes(needle)) {
      console.error(`dry-run pack listing missing ${needle}`)
      console.error(listed)
      process.exit(1)
    }
  }
}

console.log(`pack smoke ok: ${path.basename(tgz)}`)
console.log(
  `optionalDependencies platforms: ${Object.keys(pkgJson.optionalDependencies).join(', ')}`,
)
