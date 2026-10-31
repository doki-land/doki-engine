#!/usr/bin/env node
/**
 * Align publishable Doki package versions (and rewrite file:/workspace deps
 * among them to the target version). Platform optionalDeps always pin to same version.
 *
 * Usage: node scripts/set-release-version.mjs 0.0.0
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    JS_PACKAGES,
    NAPI_BUILD,
    optionalDepsMap,
    PLATFORM_PACKAGES,
    PRIVATE_BUILD_PACKAGES,
} from "./doki-release-packages.mjs";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+([.-].*)?$/.test(version)) {
    console.error("usage: node scripts/set-release-version.mjs <X.Y.Z>");
    process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Workspace-private only — never published by release-npm. */
const LEGACY_PACKAGES = [
    {
        name: "@doki-land/doki-deploy",
        path: "compilers/doki-deploy/package.json",
    },
    {
        name: "@doki-land/doki-migrate",
        path: "compilers/doki-migrate/package.json",
    },
    {
        name: "@doki-land/doki-engine",
        path: "compilers/doki-engine/package.json",
    },
    { name: "@doki-land/doki-lsp", path: "compilers/doki-lsp/package.json" },
];

const names = new Set([
    ...JS_PACKAGES.map((p) => p.name),
    ...PLATFORM_PACKAGES.map((p) => p.name),
    ...LEGACY_PACKAGES.map((p) => p.name),
]);

function rewriteDeps(deps) {
    if (!deps || typeof deps !== "object") return deps;
    const out = { ...deps };
    for (const [k, v] of Object.entries(out)) {
        if (!names.has(k) || typeof v !== "string") continue;
        if (v.startsWith("workspace:") || v.startsWith("file:")) {
            out[k] = version;
        }
    }
    return out;
}

for (const pkg of [...JS_PACKAGES, ...PRIVATE_BUILD_PACKAGES]) {
    const file = join(root, pkg.path, "package.json");
    if (!existsSync(file)) {
        console.warn(`skip missing ${file}`);
        continue;
    }
    const json = JSON.parse(readFileSync(file, "utf8"));
    if (json.name !== pkg.name) {
        throw new Error(
            `${pkg.path}: expected name ${pkg.name}, got ${json.name}`,
        );
    }
    json.version = version;
    json.dependencies = rewriteDeps(json.dependencies);
    json.devDependencies = rewriteDeps(json.devDependencies);
    json.peerDependencies = rewriteDeps(json.peerDependencies);
    if (pkg.name === "@doki-land/doki" || pkg.name === NAPI_BUILD.name) {
        json.optionalDependencies = optionalDepsMap(version);
    } else {
        json.optionalDependencies = rewriteDeps(json.optionalDependencies);
    }
    writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
    console.log(
        `set ${pkg.name}@${version}${json.private ? " (private)" : ""}`,
    );
}

for (const plat of PLATFORM_PACKAGES) {
    const file = join(root, NAPI_BUILD.npmRoot, plat.npmDir, "package.json");
    if (!existsSync(file)) {
        console.warn(`skip missing platform stub ${file}`);
        continue;
    }
    const json = JSON.parse(readFileSync(file, "utf8"));
    json.version = version;
    writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
    console.log(`set ${plat.name}@${version}`);
}

for (const pkg of LEGACY_PACKAGES) {
    const file = join(root, pkg.path);
    if (!existsSync(file)) continue;
    const json = JSON.parse(readFileSync(file, "utf8"));
    if (json.name !== pkg.name) continue;
    json.version = version;
    json.dependencies = rewriteDeps(json.dependencies);
    json.devDependencies = rewriteDeps(json.devDependencies);
    json.peerDependencies = rewriteDeps(json.peerDependencies);
    json.optionalDependencies = rewriteDeps(json.optionalDependencies);
    writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
    console.log(`set legacy ${pkg.name}@${version}`);
}

// Scaffold templates ship inside `@doki-land/doki` with a placeholder pin so
// the repo stays version-agnostic; published tarballs must point at the
// release version or `doki new` installs a stale engine.
for (const rel of [
    "runtimes/doki/templates/minimal/package.json",
    "runtimes/doki/templates/blog/package.json",
]) {
    const file = join(root, rel);
    if (!existsSync(file)) continue;
    const json = JSON.parse(readFileSync(file, "utf8"));
    for (const field of ["dependencies", "devDependencies"]) {
        const deps = json[field];
        if (!deps) continue;
        for (const name of Object.keys(deps)) {
            if (names.has(name)) deps[name] = version;
        }
    }
    writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
    console.log(`pinned scaffold ${rel}`);
}
