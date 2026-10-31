#!/usr/bin/env node
import { spawnSync } from "node:child_process";
/**
 * Build a portable @doki-land/doki directory via `pnpm deploy`.
 *
 * Usage:
 *   node scripts/pack-doki-portable.mjs --out portable
 *   node scripts/pack-doki-portable.mjs --out portable --zip dist-artifacts/doki-v0.0.0-linux-x64.zip
 */
import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback = undefined) {
    const i = process.argv.indexOf(name);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    return fallback;
}

const outDir = resolve(root, arg("--out", "portable"));
const zipPath = arg("--zip");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(dirname(outDir), { recursive: true });

const deploy = spawnSync(
    "pnpm",
    ["--filter", "@doki-land/doki", "deploy", "--prod", outDir],
    { cwd: root, shell: true, stdio: "inherit", env: process.env },
);
if (deploy.status !== 0) {
    console.error("pnpm deploy failed");
    process.exit(deploy.status ?? 1);
}

const pkg = JSON.parse(
    readFileSync(join(root, "runtimes/doki/package.json"), "utf8"),
);

writeFileSync(
    join(outDir, "README.release.md"),
    `# doki ${pkg.version}

Portable Node.js distribution of \`@doki-land/doki\` (platform binary from the CI runner).

\`\`\`bash
node bin/doki.js --help
./bin/doki.js build
\`\`\`

Requires Node.js 18+.
`,
);

if (zipPath) {
    const absZip = resolve(root, zipPath);
    mkdirSync(dirname(absZip), { recursive: true });
    rmSync(absZip, { force: true });
    const zipDir = dirname(absZip);
    const stage = join(zipDir, ".pack-stage");
    rmSync(stage, { recursive: true, force: true });
    mkdirSync(stage, { recursive: true });
    cpSync(outDir, join(stage, "doki"), { recursive: true });
    const zip = spawnSync("zip", ["-r", absZip, "doki"], {
        cwd: stage,
        stdio: "inherit",
    });
    rmSync(stage, { recursive: true, force: true });
    if (zip.status !== 0) {
        console.error("zip failed — is the zip CLI installed?");
        process.exit(zip.status ?? 1);
    }
    if (!existsSync(absZip)) {
        console.error(`zip missing: ${absZip}`);
        process.exit(1);
    }
    console.log(`wrote ${absZip}`);
}

console.log(`portable ready: ${outDir}`);
