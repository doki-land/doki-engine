import path from 'node:path'
import fs from 'node:fs'
import { findProjectRoot } from './find-project.mjs'
import { tryHandoffToProjectLocal } from './handoff.mjs'
import { resolveExtensions } from './resolve-extensions.mjs'
import { runSegmentedBuild } from './run-build.mjs'
import { createSite } from './new-site.mjs'
import { loadCore } from './load-core.mjs'
import {
  writeDeployConfig,
  isPlatformSupported,
  SUPPORTED_PLATFORMS,
} from './deploy.mjs'

function usage() {
  return `Usage: doki <command> [options]

Commands:
  new [dir]              Scaffold a site (templates: minimal|blog)
  build                  Production build via Rust N-API kernel
  check                  Validate / dry-run build (check mode)
  dev                    Development build (+ optional --watch)
  deploy <platform>      Write static-host config (netlify|vercel|github|cloudflare)
  inspect <kind> [path]  Inspect session: config | theme | plugins | page <rel>
  explain rebuild <path> Explain whether a path change rebuilds
  doctor                 Sanity-check Node + native core

Options:
  --root <dir>           Project root (default: walk up for doki.toml)
  --template <name>      Site template for \`doki new\` (default: minimal)
  --output <dir>         Deploy publish directory (default: dist)
  --node-version <ver>   Node version for host CI (default: 20)
  --force                Overwrite existing deploy config
  --allow-local          Merge doki.local.toml
  --allow-global         Use this CLI even when project has @doki-land/doki
  --watch                (dev) rebuild on content/config changes
  -h, --help             Show help
`
}

function parseArgs(argv) {
  const args = { _: [], flags: {} }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--root' || a === '--cwd') {
      args.flags.root = argv[++i]
    } else if (a === '--template') {
      args.flags.template = argv[++i]
    } else if (a === '--output') {
      args.flags.output = argv[++i]
    } else if (a === '--node-version') {
      args.flags.nodeVersion = argv[++i]
    } else if (a === '--force') {
      args.flags.force = true
    } else if (a === '--allow-local') {
      args.flags.allowLocal = true
    } else if (a === '--allow-global') {
      args.flags.allowGlobal = true
    } else if (a === '--watch') {
      args.flags.watch = true
    } else if (a === '-h' || a === '--help') {
      args.flags.help = true
    } else if (a.startsWith('-')) {
      throw new Error(`unknown option: ${a}`)
    } else {
      args._.push(a)
    }
  }
  return args
}

/**
 * @param {string[]} argv
 */
export async function runCli(argv) {
  const args = parseArgs(argv)
  if (args.flags.help || args._.length === 0) {
    console.log(usage())
    return
  }

  const cmd = args._[0]

  if (cmd === 'new') {
    const target = path.resolve(args.flags.root || process.cwd(), args._[1] || '.')
    const result = createSite(target, args.flags.template || 'minimal')
    console.log(`Created Doki site (${result.template}) at ${result.root}`)
    console.log(`Next: cd ${result.root} && pnpm add -D @doki-land/doki && pnpm doki build`)
    return
  }

  if (cmd === 'doctor') {
    await doctor()
    return
  }

  if (cmd === 'deploy') {
    const platform = args._[1]
    if (!platform || !isPlatformSupported(platform)) {
      throw new Error(
        `usage: doki deploy <${SUPPORTED_PLATFORMS.join('|')}> [--output dist] [--force]`,
      )
    }
    const startDir = path.resolve(args.flags.root || process.cwd())
    const root = findProjectRoot(startDir) || startDir
    const written = writeDeployConfig(root, platform, {
      outputDir: args.flags.output || 'dist',
      nodeVersion: args.flags.nodeVersion,
      force: Boolean(args.flags.force),
    })
    console.log(`wrote ${written.path}`)
    return
  }

  const startDir = path.resolve(args.flags.root || process.cwd())
  const root = findProjectRoot(startDir)
  if (!root) {
    throw new Error(
      `no doki.toml found from ${startDir}; run \`doki new\` or pass --root`,
    )
  }

  if (!args.flags.allowGlobal && cmd !== 'doctor') {
    const handed = await tryHandoffToProjectLocal(root, argv)
    if (handed) return
  }

  const core = await loadCore()
  const allowLocal = Boolean(args.flags.allowLocal) || cmd === 'dev'

  if (cmd === 'build' || cmd === 'check' || cmd === 'dev') {
    const mode =
      cmd === 'build' ? 'production' : cmd === 'check' ? 'check' : 'development'
    const result = await runSegmentedBuild(core, {
      root,
      mode,
      allowLocal,
      watch: cmd === 'dev' && args.flags.watch,
    })
    if (cmd === 'check') {
      console.log(
        `check ok — ${result.contentCount ?? '?'} content node(s), buildId=${result.buildId}`,
      )
    } else {
      console.log(
        `built ${result.committedFiles?.length ?? 0} file(s) → ${path.join(root, result.outputDir || 'dist')}`,
      )
    }
    return
  }

  if (cmd === 'inspect') {
    const kind = args._[1] || 'config'
    await inspectCmd(core, root, allowLocal, kind, args._[2])
    return
  }

  if (cmd === 'explain') {
    if (args._[1] !== 'rebuild' || !args._[2]) {
      throw new Error('usage: doki explain rebuild <path>')
    }
    const sessionId = core.openProject(root, allowLocal)
    try {
      const snap = core.inspect(sessionId)
      const extensions = await resolveExtensions(root, snap.extensions || [], snap.overrides || {})
      core.setResolvedExtensions(sessionId, extensions)
      const explanation = core.explainRebuild(sessionId, args._[2])
      console.log(JSON.stringify(explanation, null, 2))
    } finally {
      core.dispose(sessionId)
    }
    return
  }

  throw new Error(`unknown command: ${cmd}\n${usage()}`)
}

async function doctor() {
  console.log(`node ${process.version}`)
  console.log(`cli  ${fileURLToPathHint()}`)
  try {
    const core = await loadCore()
    const keys = Object.keys(core).sort()
    console.log(`core exports: ${keys.join(', ')}`)
    console.log('doctor: ok')
  } catch (err) {
    console.error(`doctor: failed to load Doki native binding — ${err.message}`)
    process.exitCode = 1
  }
}

function fileURLToPathHint() {
  try {
    return path.dirname(new URL(import.meta.url).pathname)
  } catch {
    return '(cli)'
  }
}

async function inspectCmd(core, root, allowLocal, kind, pagePath) {
  const sessionId = core.openProject(root, allowLocal)
  try {
    const snap = core.inspect(sessionId)
    const extensions = await resolveExtensions(root, snap.extensions || [], snap.overrides || {})
    core.setResolvedExtensions(sessionId, extensions)
    const fresh = core.inspect(sessionId)

    if (kind === 'config') {
      console.log(
        JSON.stringify(
          {
            root: fresh.root,
            title: fresh.title,
            contentDir: fresh.contentDir,
            outputDir: fresh.outputDir,
            incremental: fresh.incremental,
            overrides: fresh.overrides,
          },
          null,
          2,
        ),
      )
      return
    }
    if (kind === 'theme') {
      console.log(
        JSON.stringify(
          (fresh.extensions || []).filter((e) => e.kind === 'theme'),
          null,
          2,
        ),
      )
      return
    }
    if (kind === 'plugins') {
      console.log(
        JSON.stringify(
          (fresh.extensions || []).filter((e) => e.kind === 'plugin'),
          null,
          2,
        ),
      )
      return
    }
    if (kind === 'page') {
      if (!pagePath) throw new Error('usage: doki inspect page <content-rel-path>')
      const contentDir = fresh.contentDir || 'content'
      const abs = path.join(root, contentDir, pagePath)
      if (!fs.existsSync(abs)) {
        throw new Error(`page not found: ${abs}`)
      }
      console.log(
        JSON.stringify(
          {
            path: pagePath.replace(/\\/g, '/'),
            absolute: abs,
            bytes: fs.statSync(abs).size,
          },
          null,
          2,
        ),
      )
      return
    }
    throw new Error(`unknown inspect kind: ${kind}`)
  } finally {
    core.dispose(sessionId)
  }
}
