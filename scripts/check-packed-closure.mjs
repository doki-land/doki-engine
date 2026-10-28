#!/usr/bin/env node
/**
 * Packed-closure gate for the Doki npm surface.
 *
 * Stages the freshly built `doki-core.<host>.node` into its platform package,
 * pins the release version, `npm pack`s every publishable package and installs
 * a throw-away consumer project from those local tarballs only. Then it runs
 * `doki doctor`, `doki new --template blog` and `doki build`, asserting the
 * rendered output and that the native binding really comes from the optional
 * platform dependency (no silent skip / fallback).
 *
 * Usage (from doki-engine root):
 *   node scripts/check-packed-closure.mjs
 *   node scripts/check-packed-closure.mjs --host darwin-arm64 --version 0.0.1
 *   node scripts/check-packed-closure.mjs --keep
 *
 * Options:
 *   --host <host>     napi host suffix (default: detect current platform)
 *   --version <x.y.z> release version to pin (default: SMOKE_VERSION)
 *   --keep            keep the temp directory for debugging
 *
 * Prerequisites:
 *   - Rust addon already built at `compilers/doki-node/doki-core.<host>.node`
 *   - npm on PATH
 *
 * Cross-arch runners (e.g. a darwin-x64 target on an arm64 macOS runner)
 * cannot execute the foreign binary. In that case the gate still packs,
 * installs and verifies the tarball closure plus loader wiring, prints a
 * notice, and skips native execution instead of failing silently.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import {
  JS_PACKAGES,
  NAPI_BUILD,
  PLATFORM_PACKAGES,
  SMOKE_VERSION,
  findPlatformByHost,
} from './doki-release-packages.mjs'
import { detectHost, npmPack, run, runOk } from './doki-pack-helpers.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const TMP_PREFIX = 'doki-packed-closure-'
const REQUIRED_DIST_FILES = [
  'pages/index.html',
  'sitemap.xml',
  'robots.txt',
  'atom.xml',
  'search-index.json',
]

/**
 * package.json files owned by `scripts/set-release-version.mjs`. Snapshot them
 * before the pack and restore them afterwards so the work tree stays clean.
 */
const RELEASE_OWNED_PACKAGE_JSON = [
  ...JS_PACKAGES.map((pkg) => `${pkg.path}/package.json`),
  `${NAPI_BUILD.path}/package.json`,
  ...PLATFORM_PACKAGES.map((plat) => `${NAPI_BUILD.npmRoot}/${plat.npmDir}/package.json`),
  'compilers/doki-deploy/package.json',
  'compilers/doki-migrate/package.json',
  'compilers/doki-engine/package.json',
  'compilers/doki-lsp/package.json',
  'runtimes/doki/templates/minimal/package.json',
  'runtimes/doki/templates/blog/package.json',
]

function parseArgs(argv) {
  const out = { keep: false, host: null, version: SMOKE_VERSION }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--keep') {
      out.keep = true
    } else if (arg === '--host' || arg === '--version') {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`)
      i += 1
      if (arg === '--host') out.host = value
      else out.version = value
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }
  if (!out.host) out.host = detectHost(null)
  if (!/^\d+\.\d+\.\d+([.-].*)?$/.test(out.version)) {
    throw new Error(`--version must be X.Y.Z, got ${out.version}`)
  }
  return out
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function snapshotPackageJson() {
  const saved = new Map()
  for (const rel of RELEASE_OWNED_PACKAGE_JSON) {
    const file = path.join(root, rel)
    saved.set(file, existsSync(file) ? readFileSync(file) : null)
  }
  return saved
}

function restorePackageJson(saved) {
  let restored = 0
  for (const [file, contents] of saved) {
    if (contents === null) continue
    const current = existsSync(file) ? readFileSync(file) : null
    if (current && current.equals(contents)) continue
    writeFileSync(file, contents)
    restored += 1
  }
  if (restored > 0) console.log(`restored ${restored} package.json file(s)`)
}

/**
 * `npm pack` of the facade would ship any leftover `.node` from earlier local
 * staging, which would hide a broken optional-dependency closure. Move those
 * stray binaries aside for the pack and put them back afterwards. The holding
 * directory stays on the repo volume so `rename` cannot hit EXDEV.
 */
function detachStrayFacadeNative(holdingDir) {
  const dir = path.join(root, 'runtimes/doki/native')
  if (!existsSync(dir)) return () => {}
  const stray = readdirSync(dir).filter((name) => name.endsWith('.node'))
  if (stray.length === 0) return () => {}

  mkdirSync(holdingDir, { recursive: true })
  const moves = stray.map((name) => ({
    from: path.join(dir, name),
    to: path.join(holdingDir, name),
  }))
  for (const move of moves) renameSync(move.from, move.to)
  console.log(`moved ${stray.length} stray facade binary aside: ${stray.join(', ')}`)

  return () => {
    for (const move of moves) {
      if (existsSync(move.to)) renameSync(move.to, move.from)
    }
    rmSync(holdingDir, { recursive: true, force: true })
  }
}

function runtimeMatchesHost(plat) {
  return plat.os.includes(process.platform) && plat.cpu.includes(process.arch)
}

/** Parse a node-tar header into { name, size } without extracting the file. */
function parseTarEntry(buf, offset = 0) {
  const nameRaw = buf.slice(offset, offset + 100)
  const nullIdx = nameRaw.indexOf(0)
  const name = Buffer.isBuffer(nameRaw)
    ? nameRaw.slice(0, nullIdx === -1 ? 100 : nullIdx).toString('utf8')
    : String(nameRaw)
  const sizeRaw = buf.slice(offset + 124, offset + 136).toString('ascii').trim()
  const size = sizeRaw.length === 0 ? 0 : parseInt(sizeRaw, 8)
  return { name, size }
}

/** Walk a gzipped node-tar archive and yield [{ name, size }] for every regular file. */
function* iterTarballEntries(tgzPath) {
  const raw = zlib.gunzipSync(readFileSync(tgzPath))
  let offset = 0
  while (offset + 512 <= raw.length) {
    const { name, size } = parseTarEntry(raw, offset)
    if (name.length === 0) {
      // Two consecutive empty 512-byte blocks mark end-of-archive per POSIX tar.
      if (offset + 1024 <= raw.length && parseTarEntry(raw, offset + 512).name.length === 0) break
      offset += 512
      continue
    }
    const typeflag = raw[offset + 156]
    // '0' or '\0' = regular file; skip symlinks/devices/etc
    if ((typeflag === 0x30 || typeflag === 0x00) && size > 0) {
      yield { name, size }
    }
    // Round up to multiple of 512
    const dataBlocks = Math.ceil(size / 512)
    offset += 512 + dataBlocks * 512
  }
}

/** Return the path inside the tarball for package.json (node-tar prefixes package/). */
function packageJsonInsideTarball(tgzPath) {
  for (const entry of iterTarballEntries(tgzPath)) {
    const normalized = entry.name.startsWith('package/') ? entry.name.slice('package/'.length) : entry.name
    if (normalized === 'package.json') return { found: true, entry }
  }
  return { found: false }
}

/** Extract and parse package.json from a gzipped tarball without writing to disk. */
function platformTarballPkgJson(tgzPath) {
  const raw = zlib.gunzipSync(readFileSync(tgzPath))
  let offset = 0
  while (offset + 512 <= raw.length) {
    const { name, size } = parseTarEntry(raw, offset)
    if (name.length === 0) {
      if (offset + 1024 <= raw.length && parseTarEntry(raw, offset + 512).name.length === 0) break
      offset += 512
      continue
    }
    const normalized = name.startsWith('package/') ? name.slice('package/'.length) : name
    if (normalized === 'package.json' && size > 0) {
      const buf = raw.slice(offset + 512, offset + 512 + size)
      return JSON.parse(buf.toString('utf8'))
    }
    const dataBlocks = Math.ceil(size / 512)
    offset += 512 + dataBlocks * 512
  }
  throw new Error(`no package.json inside ${tgzPath}`)
}

/** Check whether a tarball contains a file matching the given relative path. */
function tarballHasFile(tgzPath, relPath) {
  // Some tarballs prefix files with "package/", some don't — accept both.
  const needles = new Set([relPath, `package/${relPath}`])
  for (const entry of iterTarballEntries(tgzPath)) {
    if (needles.has(entry.name)) return true
  }
  return false
}

function printCommandOutput(label, result) {
  const text = `${result.stdout || ''}${result.stderr || ''}`.trim()
  if (!text) return
  console.log(`${label}:`)
  for (const line of text.split(/\r?\n/)) console.log(`  | ${line}`)
}

function assertRenderedOutput(siteDir) {
  const dist = path.join(siteDir, 'dist')
  const missing = REQUIRED_DIST_FILES.filter((rel) => !existsSync(path.join(dist, rel)))
  assert(
    missing.length === 0,
    `dist is missing ${missing.join(', ')} (present: ${
      existsSync(dist) ? readdirSync(dist).join(', ') : '(no dist)'
    })`,
  )

  const htmlFile = path.join(dist, 'pages/index.html')
  const html = readFileSync(htmlFile, 'utf8')
  assert(html.length > 200, `${htmlFile} looks empty (${html.length} bytes)`)
  assert(html.includes('<!DOCTYPE html>'), `${htmlFile} is not a rendered document`)
  assert(
    html.includes('/assets/plain.css'),
    `${htmlFile} does not reference the theme stylesheet (unrendered layout?)`,
  )
  assert(html.includes('My Blog'), `${htmlFile} does not contain the site title (unrendered?)`)
  assert(!html.includes('<%'), `${htmlFile} still contains template markers`)

  const sitemap = readFileSync(path.join(dist, 'sitemap.xml'), 'utf8')
  assert(sitemap.includes('<urlset'), 'sitemap.xml has no urlset (unrendered?)')
  const feed = readFileSync(path.join(dist, 'atom.xml'), 'utf8')
  assert(feed.includes('<feed'), 'atom.xml has no feed element (unrendered?)')
  const search = JSON.parse(readFileSync(path.join(dist, 'search-index.json'), 'utf8'))
  assert(
    Array.isArray(search.entries) && search.entries.length > 0,
    'search-index.json has no entries',
  )
  const robots = readFileSync(path.join(dist, 'robots.txt'), 'utf8')
  assert(robots.trim().length > 0, 'robots.txt is empty')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const plat = findPlatformByHost(args.host)
  if (!plat) throw new Error(`unknown --host ${args.host}`)

  const addon = path.join(root, NAPI_BUILD.path, `doki-core.${args.host}.node`)
  if (!existsSync(addon)) {
    throw new Error(
      `missing ${addon}; build it first (cd ${NAPI_BUILD.path} && npm run build)`,
    )
  }

  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX))
  assert(tmpRoot.includes(TMP_PREFIX), `refusing unsafe temp dir ${tmpRoot}`)

  const savedPackageJson = snapshotPackageJson()
  const restoreStrayNative = detachStrayFacadeNative(
    path.join(root, 'target/packed-closure-stray'),
  )
  const packed = []

  try {
    console.log(`packed-closure version=${args.version} host=${args.host} (${plat.name})`)

    const platformDir = path.join(root, NAPI_BUILD.npmRoot, plat.npmDir)
    mkdirSync(platformDir, { recursive: true })
    const staged = path.join(platformDir, `doki-core.${args.host}.node`)
    copyFileSync(addon, staged)
    console.log(`staged ${plat.name} -> ${path.relative(root, staged)}`)

    runOk(process.execPath, [path.join(root, 'scripts/set-release-version.mjs'), args.version], {
      cwd: root,
    })

    const packDir = path.join(tmpRoot, 'pack')
    const platformTarball = npmPack(platformDir, packDir)
    const jsTarballs = []
    for (const pkg of JS_PACKAGES) {
      jsTarballs.push(npmPack(path.join(root, pkg.path), packDir))
    }
    packed.push(platformTarball, ...jsTarballs)
    console.log('packed:')
    for (const tarball of packed) console.log(`  ${path.basename(tarball)}`)

    const consumer = path.join(tmpRoot, 'consumer')
    mkdirSync(consumer, { recursive: true })
    writeFileSync(
      path.join(consumer, 'package.json'),
      `${JSON.stringify(
        { name: 'doki-packed-closure-consumer', private: true, version: '0.0.0' },
        null,
        2,
      )}\n`,
    )

    const fullMode = runtimeMatchesHost(plat)
    const platDirName = plat.name.replace(/^@[\w-]+\//, '')
    // Mirror dejavu: --save-exact keeps the local-tarball hoisting stable so
    // npm filters optional deps by `os`/`cpu` and installs the matching
    // platform package. npm/cli#4828 is avoided by running on a recent npm.
    const tarballsToInstall = fullMode ? packed : jsTarballs
    const installArgs = [
      'install',
      ...tarballsToInstall,
      '--no-audit',
      '--no-fund',
      '--save-exact',
    ]
    if (!fullMode) {
      console.log(
        `notice: ${args.host} cannot run on this node (${process.platform}/${process.arch}); ` +
          'verifying the packed closure only (skip install of platform tarball)',
      )
    }
    runOk('npm', installArgs, { cwd: consumer })

    // Always verify JS packages and optional dep wiring.
    const installedRoot = path.join(consumer, 'node_modules')
    const installedDoki = readJson(path.join(installedRoot, '@doki-land/doki/package.json'))
    assert(
      installedDoki.version === args.version,
      `installed @doki-land/doki@${installedDoki.version} != ${args.version}`,
    )
    assert(
      installedDoki.optionalDependencies?.[plat.name] === args.version,
      `@doki-land/doki optionalDependencies missing ${plat.name}@${args.version}`,
    )
    assert(
      !existsSync(
        path.join(installedRoot, '@doki-land/doki/native', `doki-core.${args.host}.node`),
      ),
      '@doki-land/doki tarball bundles a native binary, optional closure is not tested',
    )

    // Verify the platform tarball structure — we pack it regardless of runner arch,
    // cross-arch runners just can't install it directly.
    const platformPkgJson = platformTarballPkgJson(platformTarball)
    assert(platformPkgJson.name === plat.name, `platform tarball name ${platformPkgJson.name} != ${plat.name}`)
    assert(platformPkgJson.version === args.version, `platform tarball version ${platformPkgJson.version} != ${args.version}`)
    assert(platformPkgJson.os?.includes(plat.os), `platform tarball os ${platformPkgJson.os} missing ${plat.os}`)
    assert(platformPkgJson.cpu?.includes(plat.cpu), `platform tarball cpu ${platformPkgJson.cpu} missing ${plat.cpu}`)
    const platformMain = platformPkgJson.main
    assert(platformMain, 'platform tarball has no main field')
    const nodeExists = tarballHasFile(platformTarball, platformMain)
    assert(nodeExists, `platform tarball ${plat.name} is missing ${platformMain}`)
    console.log(`platform tarball ${plat.name} structure ok (version/os/cpu/.node present)`)

    const dokiLandEntries = readdirSync(path.join(installedRoot, '@doki-land')).sort()
    const expectedEntriesFull = ['doki', 'doki-plugin', 'doki-theme', platDirName].sort()
    const expectedEntriesPartial = ['doki', 'doki-plugin', 'doki-theme'].sort()
    const expectedEntries = fullMode ? expectedEntriesFull : expectedEntriesPartial
    assert(
      JSON.stringify(dokiLandEntries) === JSON.stringify(expectedEntries),
      `unexpected @doki-land install set: ${dokiLandEntries.join(', ')} (expected ${expectedEntries.join(', ')})`,
    )

    const cli = path.join(installedRoot, '@doki-land/doki/bin/doki.js')
    assert(existsSync(cli), `installed @doki-land/doki has no bin at ${cli}`)

    if (!fullMode) {
      console.log('packed closure ok (native execution skipped: cross-arch runner)')
      return
    }

    // Full-mode: also verify platform package installed from optionalDeps.
    const installedPlatform = readJson(
      path.join(installedRoot, plat.name, 'package.json'),
    )
    assert(
      installedPlatform.version === args.version,
      `installed ${plat.name}@${installedPlatform.version} != ${args.version}`,
    )
    assert(
      existsSync(path.join(installedRoot, plat.name, installedPlatform.main)),
      `${plat.name} tarball is missing ${installedPlatform.main}`,
    )

    const doctor = runOk(process.execPath, [cli, 'doctor'], { cwd: consumer })
    printCommandOutput('doki doctor', doctor)
    assert(
      `${doctor.stdout}${doctor.stderr}`.includes('doctor: ok'),
      'doki doctor did not report ok',
    )
    assert(
      `${doctor.stdout}${doctor.stderr}`.includes('openProject'),
      'doki doctor did not list core exports',
    )

    const scaffold = runOk(process.execPath, [cli, 'new', 'site', '--template', 'blog'], {
      cwd: consumer,
    })
    printCommandOutput('doki new', scaffold)
    assert(
      scaffold.stdout.includes('Created Doki site (blog)'),
      'doki new did not scaffold the blog template',
    )

    const siteDir = path.join(consumer, 'site')
    assert(existsSync(path.join(siteDir, 'doki.toml')), 'scaffold is missing doki.toml')

    const build = runOk(process.execPath, [cli, 'build'], { cwd: siteDir })
    printCommandOutput('doki build', build)
    assert(/built \d+ file\(s\)/.test(build.stdout), 'doki build did not commit any files')

    assertRenderedOutput(siteDir)

    // Removing the platform package must break native loading: proves the
    // binding is not silently skipped or bundled into the facade tarball.
    const platformInstall = path.join(installedRoot, plat.name)
    const parked = `${platformInstall}.parked`
    renameSync(platformInstall, parked)
    const probe = path.join(consumer, 'probe-no-native.cjs')
    writeFileSync(probe, "require('@doki-land/doki/native')\n")
    try {
      const negative = run(process.execPath, [probe], { cwd: consumer, allowFail: true })
      const output = `${negative.stdout}${negative.stderr}`
      assert(
        negative.status !== 0,
        'native binding loaded without the optional platform package (silent skip)',
      )
      assert(
        /Cannot find native binding|Failed to load native binding/.test(output),
        `unexpected failure without the platform package: ${output.trim()}`,
      )
      console.log('native closure ok (missing platform package is rejected)')
    } finally {
      renameSync(parked, platformInstall)
    }

    console.log(`dist files: ${REQUIRED_DIST_FILES.join(', ')}`)
    console.log('packed closure ok')
  } finally {
    restoreStrayNative()
    restorePackageJson(savedPackageJson)
    if (args.keep) console.log(`kept ${tmpRoot}`)
    else rmSync(tmpRoot, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(`packed-closure: FAILED — ${err?.message || err}`)
  if (err?.stack) console.error(err.stack)
  process.exitCode = 1
})
