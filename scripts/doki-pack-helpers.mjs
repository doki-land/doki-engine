/**
 * Shared process / host / npm-pack helpers for the Doki smoke and
 * packed-closure gates.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

export function run(cmd, cmdArgs, opts = {}) {
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

export function runOk(cmd, cmdArgs, opts = {}) {
  return run(cmd, cmdArgs, { ...opts, allowFail: false })
}

export function detectHost(hostOverride) {
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

export function npmPack(dir, destDir) {
  mkdirSync(destDir, { recursive: true })
  const before = new Set(readdirSync(destDir))
  runOk('npm', ['pack', '--pack-destination', destDir], { cwd: dir })
  const added = readdirSync(destDir).filter((f) => f.endsWith('.tgz') && !before.has(f))
  if (added.length !== 1) {
    throw new Error(`expected 1 new tarball in ${destDir}, got ${added.join(', ') || '(none)'}`)
  }
  return path.join(destDir, added[0])
}
