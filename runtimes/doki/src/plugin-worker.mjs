import { parentPort, workerData } from 'node:worker_threads'
import { loadPluginModule } from './resolve-extensions.mjs'

async function main() {
  const { resolvedPath, mode, pluginId, hookName, input } = workerData
  const { plugin } = await loadPluginModule(resolvedPath, mode)
  const fn = plugin.hooks?.[hookName]
  let patch = null
  if (typeof fn === 'function') {
    patch = (await fn(input)) ?? null
  }
  parentPort.postMessage({ ok: true, pluginId, patch })
}

main().catch((err) => {
  parentPort.postMessage({ ok: false, error: err?.message || String(err) })
})
