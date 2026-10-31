import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Resolve path|package extensions to absolute `resolvedPath`, applying overrides.
 *
 * @param {string} root project root
 * @param {Array<Record<string, unknown>>} extensions from inspect()
 * @param {Record<string, { path?: string }>} overrides package name → path
 */
export async function resolveExtensions(root, extensions, overrides = {}) {
    const require = createRequire(path.join(root, "package.json"));
    const out = [];

    for (const ext of extensions) {
        const next = { ...ext };
        const pkgName = typeof ext.package === "string" ? ext.package : null;
        const override =
            pkgName && overrides[pkgName]?.path
                ? path.resolve(root, overrides[pkgName].path)
                : null;

        if (override) {
            if (!fs.existsSync(override)) {
                throw new Error(
                    `override path missing for ${pkgName}: ${override}`,
                );
            }
            next.resolvedPath = override;
            next.source = "localPath";
            next.path =
                path.relative(root, override).replace(/\\/g, "/") || ".";
        } else if (ext.path) {
            const abs = path.resolve(root, String(ext.path));
            if (!fs.existsSync(abs)) {
                throw new Error(`extension path not found (${ext.id}): ${abs}`);
            }
            next.resolvedPath = abs;
        } else if (pkgName) {
            let pkgJson;
            try {
                pkgJson = require.resolve(`${pkgName}/package.json`);
            } catch (err) {
                throw new Error(
                    `cannot resolve package \`${pkgName}\` from ${root}: ${err.message}`,
                );
            }
            next.resolvedPath = path.dirname(pkgJson);
        } else {
            throw new Error(`extension ${ext.id} has neither path nor package`);
        }

        out.push(next);
    }

    return out;
}

/**
 * Load a plugin module from a resolved extension directory.
 * @param {string} resolvedPath
 * @param {'development'|'production'|'check'} mode
 */
export async function loadPluginModule(resolvedPath, mode) {
    const manifest = readPluginManifest(resolvedPath);
    const entryRel =
        mode === "development" && manifest.developmentEntry
            ? manifest.developmentEntry
            : manifest.entry;
    if (!entryRel) {
        throw new Error(`plugin at ${resolvedPath} missing entry`);
    }
    const entryAbs = path.join(resolvedPath, entryRel);
    const mod = await import(pathToFileURL(entryAbs).href);
    const plugin = mod.default ?? mod.plugin ?? mod;
    if (!plugin?.id || !plugin?.hooks) {
        throw new Error(
            `invalid plugin export at ${entryAbs} (need id + hooks)`,
        );
    }
    return { plugin, manifest };
}

function readPluginManifest(dir) {
    const dokiPlugin = path.join(dir, "doki.plugin.json");
    if (fs.existsSync(dokiPlugin)) {
        return JSON.parse(fs.readFileSync(dokiPlugin, "utf8"));
    }
    const pkgPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgPath)) {
        throw new Error(`no doki.plugin.json or package.json in ${dir}`);
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (pkg.doki && typeof pkg.doki === "object") {
        if (pkg.doki.manifest) {
            const nested = path.join(dir, pkg.doki.manifest);
            return JSON.parse(fs.readFileSync(nested, "utf8"));
        }
        return pkg.doki;
    }
    // Minimal fallback for path plugins that only export JS
    if (pkg.exports || pkg.main || pkg.module) {
        return {
            kind: "plugin",
            apiVersion: "1",
            entry: pkg.module || pkg.main || "index.js",
        };
    }
    throw new Error(`package ${dir} has no doki plugin manifest`);
}
