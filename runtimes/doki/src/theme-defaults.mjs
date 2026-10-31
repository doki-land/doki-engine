import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Resolve theme package/path and return absolute `doki.defaults.toml` if present.
 * @param {string} root
 * @param {any} core
 * @param {Record<string, { path?: string }>} overrides
 * @returns {Promise<string | null>}
 */
export async function resolveThemeDefaultsPath(root, core, overrides = {}) {
    let theme;
    try {
        theme =
            typeof core.peekTheme === "function" ? core.peekTheme(root) : null;
    } catch {
        theme = null;
    }
    if (!theme) return null;

    const pkgName = theme.package || null;
    let themeRoot = null;

    if (pkgName && overrides[pkgName]?.path) {
        themeRoot = path.resolve(root, overrides[pkgName].path);
    } else if (theme.path) {
        themeRoot = path.resolve(root, theme.path);
    } else if (pkgName) {
        const require = createRequire(path.join(root, "package.json"));
        try {
            themeRoot = path.dirname(
                require.resolve(`${pkgName}/package.json`),
            );
        } catch (err) {
            throw new Error(
                `cannot resolve theme package \`${pkgName}\`: ${err.message}`,
            );
        }
    }

    if (!themeRoot || !fs.existsSync(themeRoot)) {
        if (theme.path || pkgName) {
            throw new Error(
                `theme root not found: ${themeRoot || "(unresolved)"}`,
            );
        }
        return null;
    }

    if (typeof core.findThemeDefaults === "function") {
        return core.findThemeDefaults(themeRoot) || null;
    }

    for (const name of ["doki.defaults.toml", "theme.defaults.toml"]) {
        const candidate = path.join(themeRoot, name);
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
}
