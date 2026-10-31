#!/usr/bin/env node
/**
 * Legacy `@doki-land/doki-engine` bin — redirects to formal `@doki-land/doki`.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

console.error(
    "[deprecated] `@doki-land/doki-engine` CLI is retired; preferring `@doki-land/doki`.",
);

const require = createRequire(import.meta.url);
let bin;
try {
    const pkg = require.resolve("@doki-land/doki/package.json");
    bin = require("node:path").join(
        require("node:path").dirname(pkg),
        "bin",
        "doki.js",
    );
} catch {
    console.error(
        "Install `@doki-land/doki` and run `doki` instead of the legacy doki-engine CLI.",
    );
    process.exit(1);
}

const child = spawn(process.execPath, [bin, ...process.argv.slice(2)], {
    stdio: "inherit",
    env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 1));
