#!/usr/bin/env node
import { spawnSync } from "node:child_process";
/**
 * Publish minimal 0.0.0 stubs so every Trusted-Publishing target exists on npm.
 * Does not touch workspace package.json versions and does not build .node.
 *
 * Covers the current product surface:
 *   @doki-land/doki-plugin, @doki-land/doki-theme, @doki-land/doki
 *   @doki-land/doki-<sys> for every row in doki-release-packages.mjs
 *
 * Already-published packages are skipped. Real binaries / CLI come later via
 * release-npm.yml (next semver after 0.0.0) once Trusted Publishers are set.
 *
 * Usage (from doki-engine root):
 *   node scripts/publish-trusted-stubs.mjs --dry-run
 *   node scripts/publish-trusted-stubs.mjs
 *   node scripts/publish-trusted-stubs.mjs --otp 123456
 *   NPM_OTP=123456 node scripts/publish-trusted-stubs.mjs
 *   node scripts/publish-trusted-stubs.mjs --platforms-only
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLATFORM_PACKAGES, SMOKE_VERSION } from "./doki-release-packages.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const platformsOnly = process.argv.includes("--platforms-only");
const otpArgIdx = process.argv.indexOf("--otp");
const otpOverride =
    otpArgIdx >= 0 ? process.argv[otpArgIdx + 1] : process.env.NPM_OTP || null;

/**
 * @typedef {{
 *   name: string,
 *   description: string,
 *   os?: string[],
 *   cpu?: string[],
 *   libc?: string[],
 *   kind: 'js' | 'platform',
 * }} StubPkg
 */

/** @type {StubPkg[]} */
const JS_STUBS = [
    {
        name: "@doki-land/doki-plugin",
        description: "Doki plugin SDK (Trusted Publishing placeholder)",
        kind: "js",
    },
    {
        name: "@doki-land/doki-theme",
        description: "Doki theme SDK (Trusted Publishing placeholder)",
        kind: "js",
    },
    {
        name: "@doki-land/doki",
        description: "Doki CLI + N-API loader (Trusted Publishing placeholder)",
        kind: "js",
    },
];

/** @returns {StubPkg[]} */
function platformStubs() {
    return PLATFORM_PACKAGES.map((p) => ({
        name: p.name,
        description: `Platform binary for @doki-land/doki (${p.npmDir}) — Trusted Publishing placeholder`,
        os: p.os,
        cpu: p.cpu,
        libc: p.libc ? [p.libc] : undefined,
        kind: "platform",
    }));
}

function npmViewVersion(name) {
    const r = spawnSync("npm", ["view", name, "version", "--json"], {
        encoding: "utf8",
        shell: true,
        windowsHide: true,
    });
    if (r.status !== 0) return null;
    try {
        const v = JSON.parse(r.stdout.trim());
        return typeof v === "string" ? v : null;
    } catch {
        const t = r.stdout.trim();
        return t || null;
    }
}

/**
 * @param {StubPkg} pkg
 */
function publishStub(pkg) {
    const dir = mkdtempSync(join(tmpdir(), "doki-oidc-stub-"));
    try {
        /** @type {Record<string, unknown>} */
        const meta = {
            name: pkg.name,
            version: SMOKE_VERSION,
            description: pkg.description,
            license: "MIT",
            private: false,
            main: "index.js",
            files: ["index.js", "README.md"],
            publishConfig: {
                access: "public",
                registry: "https://registry.npmjs.org/",
            },
            repository: {
                type: "git",
                url: "https://github.com/doki-land/doki-engine.git",
            },
        };
        if (pkg.os) meta.os = pkg.os;
        if (pkg.cpu) meta.cpu = pkg.cpu;
        if (pkg.libc) meta.libc = pkg.libc;

        writeFileSync(
            join(dir, "package.json"),
            `${JSON.stringify(meta, null, 2)}\n`,
        );
        writeFileSync(
            join(dir, "index.js"),
            `throw new Error(${JSON.stringify(
                `${pkg.name}@${SMOKE_VERSION} is an npm Trusted Publishing placeholder. ` +
                    `Install a later version from release-npm.yml.`,
            )});\n`,
        );
        writeFileSync(
            join(dir, "README.md"),
            `# ${pkg.name}\n\n` +
                `This **${SMOKE_VERSION}** release is a placeholder so ` +
                `[npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) ` +
                `can be configured for \`doki-land/doki-engine\` / \`release-npm.yml\`.\n\n` +
                `Do not depend on this version in applications. Real artifacts ship on the next semver.\n`,
        );

        if (dryRun) {
            console.log(`[dry-run] would publish ${pkg.name}@${SMOKE_VERSION}`);
            return true;
        }

        const publishArgs = ["publish", "--access", "public"];
        if (otpOverride) publishArgs.push("--otp", otpOverride);
        const r = spawnSync("npm", publishArgs, {
            cwd: dir,
            encoding: "utf8",
            shell: true,
            stdio: "inherit",
            windowsHide: false,
        });
        return r.status === 0;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

function main() {
    const packages = platformsOnly
        ? platformStubs()
        : [...JS_STUBS, ...platformStubs()];

    console.log(
        `trusted stubs @${SMOKE_VERSION} count=${packages.length}` +
            ` dryRun=${dryRun} platformsOnly=${platformsOnly} otp=${otpOverride ? "yes" : "no"}`,
    );
    console.log(`cwd matrix: ${root}`);

    if (!dryRun) {
        const who = spawnSync("npm", ["whoami"], {
            encoding: "utf8",
            shell: true,
            windowsHide: true,
        });
        if (who.status !== 0) {
            console.error("npm is not authenticated. Run: npm login");
            console.error(who.stderr || who.stdout);
            process.exit(1);
        }
        console.log(`npm user: ${who.stdout.trim()}`);
    }

    let published = 0;
    let skipped = 0;
    let failed = 0;
    /** @type {string[]} */
    const failedNames = [];

    for (const pkg of packages) {
        const existing = npmViewVersion(pkg.name);
        if (existing) {
            console.log(`skip  ${pkg.name} (already ${existing})`);
            skipped++;
            continue;
        }
        console.log(`\n=== publish ${pkg.name}@${SMOKE_VERSION} ===`);
        if (publishStub(pkg)) {
            published++;
            console.log(`  → https://www.npmjs.com/package/${pkg.name}/access`);
        } else {
            failed++;
            failedNames.push(pkg.name);
            console.error(`  FAILED ${pkg.name}`);
        }
    }

    console.log(
        `\ndone: published=${published} skipped=${skipped} failed=${failed}`,
    );
    if (failedNames.length) {
        console.error("failed packages:");
        for (const n of failedNames) console.error(`  - ${n}`);
        console.error(
            "\nIf npm asked for OTP, re-run with: node scripts/publish-trusted-stubs.mjs --otp <code>",
        );
        process.exit(1);
    }
    if (!dryRun && published > 0) {
        console.log(
            "\nNext: on each new package page → Access → Trusted Publishers → add\n" +
                "  repository: doki-land/doki-engine\n" +
                "  workflow: release-npm.yml\n" +
                "Then CI can publish 0.0.1+ without interactive OTP.",
        );
    }
}

main();
