import fs from "node:fs";
import path from "node:path";
import { PluginHost } from "./plugin-host.mjs";
import { resolveExtensions } from "./resolve-extensions.mjs";
import { resolveThemeDefaultsPath } from "./theme-defaults.mjs";

/**
 * Drive a full segmented build against the Rust N-API session.
 *
 * @param {any} core N-API exports from @doki-land/doki native loader
 * @param {{ root: string, mode: string, allowLocal?: boolean, watch?: boolean }} opts
 */
export async function runSegmentedBuild(core, opts) {
    const { root, mode, allowLocal = false, watch = false } = opts;

    let sessionId = core.openProject(root, allowLocal);
    try {
        let snap = core.inspect(sessionId);
        const overrides = snap.overrides || {};
        const themeDefaults = await resolveThemeDefaultsPath(
            root,
            core,
            overrides,
        );
        const themeExt = (snap.extensions || []).find(
            (e) => e.kind === "theme",
        );
        // Path themes: Rust already merged doki.defaults.toml. Package themes need reopen.
        if (themeDefaults && themeExt?.package) {
            core.dispose(sessionId);
            sessionId = core.openProject(root, allowLocal, themeDefaults);
            snap = core.inspect(sessionId);
        }

        const extensions = await resolveExtensions(
            root,
            snap.extensions || [],
            snap.overrides || {},
        );
        core.setResolvedExtensions(sessionId, extensions);

        const host = new PluginHost({ root, mode, extensions });
        await host.init();

        let plan = core.prepareBuild(sessionId, mode);
        let guard = 0;
        while (plan.phase !== "readyToCommit" && plan.phase !== "committed") {
            if (++guard > 64) {
                throw new Error("build plan loop exceeded safety limit");
            }
            const pending = plan.pendingHooks || [];
            if (pending.length === 0) {
                plan = core.continueBuild(sessionId, []);
                continue;
            }
            const results = await host.runHooks(pending);
            const failed = results.find((r) => !r.ok);
            if (failed) {
                const msg =
                    failed.diagnostics?.[0]?.message ||
                    `plugin ${failed.pluginId} failed`;
                throw new Error(msg);
            }
            plan = core.continueBuild(sessionId, results);
        }

        const result = core.commitBuild(sessionId);
        await host.dispose();

        if (watch) {
            await watchAndRebuild(core, { root, sessionId, mode });
        }

        return {
            ...result,
            contentCount: plan.contentCount,
        };
    } finally {
        if (!watch) {
            try {
                core.dispose(sessionId);
            } catch {
                /* disposed */
            }
        }
    }
}

async function watchAndRebuild(core, { root, sessionId, mode }) {
    const { watch } = await import("node:fs");
    console.error(
        "dev --watch: watching content/ and doki.toml (Ctrl+C to stop)",
    );
    const snap0 = core.inspect(sessionId);
    const contentDir = path.join(root, snap0.contentDir || "content");

    const rebuild = debounce(async (filePath) => {
        const rel = path.relative(root, filePath).replace(/\\/g, "/");
        try {
            core.invalidate(sessionId, [{ path: rel, kind: "modify" }]);
            const snap = core.inspect(sessionId);
            const extensions = await resolveExtensions(
                root,
                snap.extensions || [],
                snap.overrides || {},
            );
            core.setResolvedExtensions(sessionId, extensions);
            const host = new PluginHost({ root, mode, extensions });
            await host.init();
            let plan = core.prepareBuild(sessionId, mode);
            while (plan.phase !== "readyToCommit") {
                const pending = plan.pendingHooks || [];
                const results = pending.length
                    ? await host.runHooks(pending)
                    : [];
                plan = core.continueBuild(sessionId, results);
            }
            const result = core.commitBuild(sessionId);
            await host.dispose();
            console.error(
                `rebuilt ${result.committedFiles?.length ?? 0} file(s)`,
            );
        } catch (err) {
            console.error(`watch rebuild failed: ${err.message}`);
        }
    }, 120);

    if (fs.existsSync(contentDir)) {
        watch(contentDir, { recursive: true }, (_e, f) => {
            if (f) rebuild(path.join(contentDir, f));
        });
    }
    watch(path.join(root, "doki.toml"), () =>
        rebuild(path.join(root, "doki.toml")),
    );

    await new Promise(() => {
        /* run until process exit */
    });
}

function debounce(fn, ms) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}
