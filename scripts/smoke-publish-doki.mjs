#!/usr/bin/env node
/**
 * Smoke publish / pack for the current Doki product surface at version 0.0.0.
 *
 * Default: dry-run (build current-platform .node, stage, npm pack, local install smoke).
 * With --publish: npm publish (requires your npm login / OTP). Same version 0.0.0;
 * already-published versions are skipped (not an error).
 *
 * Usage (from doki-engine root):
 *   node scripts/smoke-publish-doki.mjs
 *   node scripts/smoke-publish-doki.mjs --publish
 *   node scripts/smoke-publish-doki.mjs --publish --otp 123456
 *   NPM_OTP=123456 node scripts/smoke-publish-doki.mjs --publish
 *
 * Prerequisites:
 *   - Sibling ../dejavu-language for Cargo path dep
 *   - cd compilers/doki-node && npm install --no-optional
 *   - rustc / toolchain for napi build
 */
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  JS_PACKAGES,
  NAPI_BUILD,
  SMOKE_VERSION,
  findPlatformByHost,
} from './doki-release-packages.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const doPublish = args.has('--publish')
const hostArgIdx = process.argv.indexOf('--host')
const hostOverride = hostArgIdx >= 0 ? process.argv[hostArgIdx + 1] : null
const otpArgIdx = process.argv.indexOf('--otp')
const otpOverride = otpArgIdx >= 0 ? process.argv[otpArgIdx + 1] : process.env.NPM_OTP || null

function run(cmd, cmdArgs, opts = {}) {
  const isWin = process.platform === 'win32'
  const isNpm = cmd === 'npm' || cmd === 'npm.cmd'
  // Windows: shell:true + spaced node path (`C:\Program Files\...`) → `'C:\Program' is not recognized`.
  // npm: shell + short name. node: no shell + process.execPath.
  const actualCmd = isNpm && isWin ? 'npm' : cmd
  const { allowFail = false, shell: shellOpt, ...rest } = opts
  const useShell = shellOpt ?? (isNpm && isWin)
  const r = spawnSync(actualCmd, cmdArgs, {
    encoding: 'utf8',
    windowsHide: true,
    ...rest,
    shell: useShell,
  })
  if (r.error) {
    console.error(r.error)
    throw r.error
  }
  if (r.status !== 0 && !allowFail) {
    console.error(r.stdout)
    console.error(r.stderr)
    throw new Error(`${actualCmd} ${cmdArgs.join(' ')} failed (${r.status})`)
  }
  return r
}

function runOk(cmd, cmdArgs, opts = {}) {
  return run(cmd, cmdArgs, { ...opts, allowFail: false })
}

function detectHost() {
  if (hostOverride) return hostOverride
  const { platform, arch } = process
  if (platform === 'win32' && arch === 'x64') return 'win32-x64-msvc'
  if (platform === 'win32' && arch === 'arm64') return 'win32-arm64-msvc'
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64'
  if (platform === 'darwin' && arch === 'x64') return 'darwin-x64'
  if (platform === 'linux' && arch === 'x64') {
    try {
      return readFileSync('/usr/bin/ldd', 'utf8').includes('musl')
        ? 'linux-x64-musl'
        : 'linux-x64-gnu'
    } catch {
      return 'linux-x64-gnu'
    }
  }
  if (platform === 'linux' && arch === 'arm64') {
    try {
      return readFileSync('/usr/bin/ldd', 'utf8').includes('musl')
        ? 'linux-arm64-musl'
        : 'linux-arm64-gnu'
    } catch {
      return 'linux-arm64-gnu'
    }
  }
  throw new Error(`unsupported platform ${platform}/${arch}; pass --host`)
}

function alignVersions() {
  runOk(process.execPath, [path.join(root, 'scripts/set-release-version.mjs'), SMOKE_VERSION], {
    cwd: root,
  })
  runOk(process.execPath, [path.join(root, 'scripts/prepare-npm-publish.mjs')], { cwd: root })
}

function buildNative(host) {
  const plat = findPlatformByHost(host)
  if (!plat) throw new Error(`unknown host ${host}`)
  const coreDir = path.join(root, NAPI_BUILD.path)
  console.log(`building native addon for ${host} (${plat.rustTarget})`)
  runOk('npm', ['run', 'build', '--', '--target', plat.rustTarget], { cwd: coreDir })
  const nodeName = `doki-core.${host}.node`
  const built = path.join(coreDir, nodeName)
  if (!existsSync(built)) {
    const found = readdirSync(coreDir).filter((f) => f.endsWith('.node'))
    throw new Error(`expected ${nodeName}, found: ${found.join(', ') || '(none)'}`)
  }
  return built
}

function stagePlatform(host, builtNode) {
  const plat = findPlatformByHost(host)
  const dir = path.join(root, NAPI_BUILD.npmRoot, plat.npmDir)
  mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `doki-core.${host}.node`)
  copyFileSync(builtNode, dest)
  console.log(`staged ${plat.name} → ${dest}`)
  return dir
}

function npmPack(dir, destDir) {
  mkdirSync(destDir, { recursive: true })
  const before = new Set(readdirSync(destDir))
  runOk('npm', ['pack', '--pack-destination', destDir], { cwd: dir })
  const added = readdirSync(destDir).filter((f) => f.endsWith('.tgz') && !before.has(f))
  if (added.length !== 1) {
    throw new Error(`expected 1 new tarball in ${destDir}, got ${added.join(', ') || '(none)'}`)
  }
  return path.join(destDir, added[0])
}

function publishDir(dir) {
  const meta = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
  console.log(`\n=== npm publish ${meta.name}@${meta.version} ===`)
  // Inherit stdio so npm can print the browser OTP URL and wait (EOTP).
  const publishArgs = ['publish', '--access', 'public']
  if (otpOverride) publishArgs.push('--otp', otpOverride)
  const r = spawnSync(process.platform === 'win32' ? 'npm' : 'npm', publishArgs, {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    windowsHide: false,
  })
  if (r.status === 0) {
    console.log(`published ${meta.name}@${meta.version}`)
    return
  }
  // Already-published is OK for smoke retries — detect via npm view.
  const view = spawnSync(
    process.platform === 'win32' ? 'npm' : 'npm',
    ['view', `${meta.name}@${meta.version}`, 'version'],
    { encoding: 'utf8', shell: process.platform === 'win32', windowsHide: true },
  )
  if (view.status === 0 && String(view.stdout || '').trim() === meta.version) {
    console.log(`skip: ${meta.name}@${meta.version} already on npm`)
    return
  }
  throw new Error(
    `npm publish failed for ${meta.name}@${meta.version} (exit ${r.status}).\n` +
      `If npm asked for OTP / browser auth: finish it, then re-run:\n` +
      `  node scripts/smoke-publish-doki.mjs --publish\n` +
      `Or pass OTP:  node scripts/smoke-publish-doki.mjs --publish --otp <code>\n` +
      `(Already-published packages are skipped.)`,
  )
}

function installSmoke({ dokiTgz, platformTgz, pluginTgz, themeTgz }) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'doki-npm-smoke-'))
  try {
    runOk('npm', ['init', '-y'], { cwd: tmp })
    // Packages are not on the registry yet — install every dep from local tarballs.
    // --omit=optional avoids fetching other @doki-land/doki-<platform> placeholders from npm.
    runOk(
      'npm',
      ['install', pluginTgz, themeTgz, dokiTgz, platformTgz, '--omit=optional'],
      { cwd: tmp },
    )
    writeFileSync(
      path.join(tmp, 'probe.cjs'),
      `const c = require('@doki-land/doki/native');
if (typeof c.openProject !== 'function') process.exit(2);
console.log('install smoke ok');
`,
    )
    runOk(process.execPath, ['probe.cjs'], { cwd: tmp })
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const host = detectHost()
const plat = findPlatformByHost(host)
console.log(`smoke version=${SMOKE_VERSION} host=${host} publish=${doPublish}`)

alignVersions()
const built = buildNative(host)
const platformDir = stagePlatform(host, built)
runOk(process.execPath, [path.join(root, 'scripts/stage-doki-native.mjs')], { cwd: root })

const packRoot = mkdtempSync(path.join(os.tmpdir(), 'doki-smoke-pack-'))
const platformTgz = npmPack(platformDir, packRoot)
const pluginPkg = JS_PACKAGES.find((p) => p.name === '@doki-land/doki-plugin')
const themePkg = JS_PACKAGES.find((p) => p.name === '@doki-land/doki-theme')
const dokiPkg = JS_PACKAGES.find((p) => p.name === '@doki-land/doki')
const pluginTgz = npmPack(path.join(root, pluginPkg.path), packRoot)
const themeTgz = npmPack(path.join(root, themePkg.path), packRoot)
const dokiTgz = npmPack(path.join(root, dokiPkg.path), packRoot)

console.log('packed:')
for (const t of [platformTgz, pluginTgz, themeTgz, dokiTgz]) {
  console.log(`  ${t}`)
}

console.log('local tarball install smoke (all deps from packed tarballs, no registry)')
installSmoke({ dokiTgz, platformTgz, pluginTgz, themeTgz })

if (doPublish) {
  // Prefer publish-trusted-stubs.mjs for multi-platform OIDC placeholders.
  // This path only publishes the current-host platform binary + JS surface.
  publishDir(path.join(root, pluginPkg.path))
  publishDir(path.join(root, themePkg.path))
  publishDir(platformDir)
  publishDir(path.join(root, dokiPkg.path))
  console.log('publish done (0.0.0 smoke). Prefer stubs for other platforms:')
  console.log('  node scripts/publish-trusted-stubs.mjs --otp <code>')
  console.log('Verify with:')
  console.log('  npm view @doki-land/doki-plugin version')
  console.log('  npm view @doki-land/doki-theme version')
  console.log(`  npm view ${plat.name} version`)
  console.log('  npm view @doki-land/doki version')
} else {
  console.log('')
  console.log('Dry-run complete. Multi-platform OIDC stubs:')
  console.log('  node scripts/publish-trusted-stubs.mjs')
  console.log('Or publish this host only:')
  console.log('  node scripts/smoke-publish-doki.mjs --publish')
}
