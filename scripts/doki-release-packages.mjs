/**
 * Shared package / platform matrix for Doki smoke + release scripts.
 *
 * Tree (after layout cleanup):
 *   compilers/doki-core   — Rust build authority (crate only)
 *   compilers/doki-node   — N-API cdylib + private npm build workspace + npm/<plat>
 *   runtimes/doki         — @doki-land/doki (CLI + staged native loader)
 *   runtimes/plugins/*    — @doki-land/doki-plugin(+-*)
 *   runtimes/themes/*     — @doki-land/doki-theme(+-*)
 *
 * Platform npm names: `@doki-land/doki-<sys>` (not doki-core-*).
 * Windows: no `-msvc` suffix (`doki-win32-x64`).
 * `host` remains napi binary suffix (still `win32-x64-msvc` for the .node file).
 */
export const SMOKE_VERSION = '0.0.0'

/** Private N-API build workspace (never published under this name). */
export const NAPI_BUILD = {
  name: '@doki-land/doki-core',
  path: 'compilers/doki-node',
  directory: 'compilers/doki-node',
  npmRoot: 'compilers/doki-node/npm',
}

/** Publish order: leaves → platform binaries → facade CLI */
export const JS_PACKAGES = [
  {
    name: '@doki-land/doki-plugin',
    path: 'runtimes/plugins/doki-plugin',
    directory: 'runtimes/plugins/doki-plugin',
  },
  {
    name: '@doki-land/doki-theme',
    path: 'runtimes/themes/doki-theme',
    directory: 'runtimes/themes/doki-theme',
  },
  {
    name: '@doki-land/doki',
    path: 'runtimes/doki',
    directory: 'runtimes/doki',
  },
]

/** @deprecated use NAPI_BUILD — kept for set-release-version loop shape */
export const PRIVATE_BUILD_PACKAGES = [NAPI_BUILD]

/**
 * @type {{ host: string, npmDir: string, rustTarget: string, name: string, os: string[], cpu: string[], libc?: string }[]}
 */
export const PLATFORM_PACKAGES = [
  {
    host: 'win32-x64-msvc',
    npmDir: 'win32-x64',
    rustTarget: 'x86_64-pc-windows-msvc',
    name: '@doki-land/doki-win32-x64',
    os: ['win32'],
    cpu: ['x64'],
  },
  {
    host: 'win32-arm64-msvc',
    npmDir: 'win32-arm64',
    rustTarget: 'aarch64-pc-windows-msvc',
    name: '@doki-land/doki-win32-arm64',
    os: ['win32'],
    cpu: ['arm64'],
  },
  {
    host: 'darwin-x64',
    npmDir: 'darwin-x64',
    rustTarget: 'x86_64-apple-darwin',
    name: '@doki-land/doki-darwin-x64',
    os: ['darwin'],
    cpu: ['x64'],
  },
  {
    host: 'darwin-arm64',
    npmDir: 'darwin-arm64',
    rustTarget: 'aarch64-apple-darwin',
    name: '@doki-land/doki-darwin-arm64',
    os: ['darwin'],
    cpu: ['arm64'],
  },  {
    host: 'linux-x64-gnu',
    npmDir: 'linux-x64',
    rustTarget: 'x86_64-unknown-linux-gnu',
    name: '@doki-land/doki-linux-x64',
    os: ['linux'],
    cpu: ['x64'],
  },  {
    host: 'linux-arm64-gnu',
    npmDir: 'linux-arm64',
    rustTarget: 'aarch64-unknown-linux-gnu',
    name: '@doki-land/doki-linux-arm64',
    os: ['linux'],
    cpu: ['arm64'],
  },
]

/**
 * napi-generated require() names → our published package names.
 *
 * napi uses `napi.packageName` from package.json (`@doki-land/doki`) plus the
 * Rust `host` suffix. We strip both `-msvc` on Windows and `-gnu` on Linux so
 * the loader matches the flat platform names in PLATFORM_PACKAGES.
 */
export const NAPI_REQUIRE_REWRITES = [
  // Windows: drop `-msvc` (napi host → our published name)
  ['@doki-land/doki-win32-x64-msvc', '@doki-land/doki-win32-x64'],
  ['@doki-land/doki-win32-arm64-msvc', '@doki-land/doki-win32-arm64'],
  // Linux: drop `-gnu` (napi host → our published name)
  ['@doki-land/doki-linux-x64-gnu', '@doki-land/doki-linux-x64'],
  ['@doki-land/doki-linux-arm64-gnu', '@doki-land/doki-linux-arm64'],
  // musl hosts also get `-musl` stripped (we publish neither gnu nor musl with
  // the libc suffix; musl loader branches resolve to the gnu-named package in
  // practice because our PLATFORM_PACKAGES only ship gnu targets — but keep the
  // rewrite symmetric in case a musl host ever runs)
  ['@doki-land/doki-linux-x64-musl', '@doki-land/doki-linux-x64'],
  ['@doki-land/doki-linux-arm64-musl', '@doki-land/doki-linux-arm64'],
]

export function optionalDepsMap(version = SMOKE_VERSION) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const p of PLATFORM_PACKAGES) {
    out[p.name] = version
  }
  return out
}

export function findPlatformByHost(host) {
  return PLATFORM_PACKAGES.find((p) => p.host === host)
}

export function findPlatformByNpmDir(npmDir) {
  return PLATFORM_PACKAGES.find((p) => p.npmDir === npmDir)
}

export function platformPackageDir(root, npmDir) {
  return `${root.replace(/\\/g, '/')}/${NAPI_BUILD.npmRoot}/${npmDir}`.replace(
    /\/+/g,
    '/',
  )
}
