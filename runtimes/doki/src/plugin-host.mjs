import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { loadPluginModule } from "./resolve-extensions.mjs";

const workerPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "plugin-worker.mjs",
);

/**
 * Plugin container: prefer Worker; fall back to in-process for environments
 * that cannot spawn workers (tests may force in-process via DOKI_PLUGIN_INLINE=1).
 */
export class PluginHost {
    /**
     * @param {object} opts
     * @param {string} opts.root
     * @param {string} opts.mode
     * @param {Array<Record<string, unknown>>} opts.extensions resolved plugins
     */
    constructor(opts) {
        this.root = opts.root;
        this.mode = opts.mode;
        /** @type {Map<string, { plugin: any, resolvedPath: string }>} */
        this.plugins = new Map();
        this.extensions = (opts.extensions || []).filter(
            (e) => e.kind === "plugin" && e.enabled !== false,
        );
        this.inline = process.env.DOKI_PLUGIN_INLINE === "1";
    }

    async init() {
        for (const ext of this.extensions) {
            const resolvedPath = String(ext.resolvedPath);
            const { plugin } = await loadPluginModule(resolvedPath, this.mode);
            // Prefer config/extension id for protocol matching
            const id = String(ext.id);
            this.plugins.set(id, { plugin: { ...plugin, id }, resolvedPath });
        }
    }

    /**
     * @param {Array<{ hook: string, pluginId: string, input: any }>} pendingHooks
     */
    async runHooks(pendingHooks) {
        const results = [];
        for (const item of pendingHooks) {
            const hookName = camelHook(item.hook);
            const entry = this.plugins.get(item.pluginId);
            if (!entry) {
                results.push({
                    pluginId: item.pluginId,
                    hook: item.hook,
                    ok: false,
                    diagnostics: [
                        {
                            severity: "error",
                            message: `plugin not loaded: ${item.pluginId}`,
                        },
                    ],
                });
                continue;
            }

            try {
                const patch = this.inline
                    ? await runInline(entry.plugin, hookName, item.input)
                    : await runInWorker(
                          entry.resolvedPath,
                          this.mode,
                          item.pluginId,
                          hookName,
                          item.input,
                      );
                results.push({
                    pluginId: item.pluginId,
                    hook: item.hook,
                    ok: true,
                    patch: patch ?? null,
                    diagnostics: [],
                    dependencies: [],
                });
            } catch (err) {
                results.push({
                    pluginId: item.pluginId,
                    hook: item.hook,
                    ok: false,
                    diagnostics: [
                        {
                            severity: "error",
                            message: err?.message || String(err),
                        },
                    ],
                });
            }
        }
        return results;
    }

    async dispose() {
        this.plugins.clear();
    }
}

function camelHook(hook) {
    if (!hook) return hook;
    // Rust may send camelCase already via serde rename
    return hook;
}

async function runInline(plugin, hookName, input) {
    const fn = plugin.hooks?.[hookName];
    if (typeof fn !== "function") return null;
    return fn(input);
}

function runInWorker(resolvedPath, mode, pluginId, hookName, input) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(workerPath, {
            workerData: { resolvedPath, mode, pluginId, hookName, input },
        });
        worker.on("message", (msg) => {
            if (msg.ok) resolve(msg.patch);
            else reject(new Error(msg.error || "plugin worker failed"));
        });
        worker.on("error", reject);
        worker.on("exit", (code) => {
            if (code !== 0) reject(new Error(`plugin worker exited ${code}`));
        });
    });
}
