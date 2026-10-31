#!/usr/bin/env node
/**
 * After `napi build`, rewrite generated optionalDependency package names in index.js
 * to the published `@doki-land/doki-<sys>` names (Windows without `-msvc`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NAPI_BUILD, NAPI_REQUIRE_REWRITES } from "./doki-release-packages.mjs";

const indexPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    NAPI_BUILD.path,
    "index.js",
);
let src = readFileSync(indexPath, "utf8");
let changed = 0;
for (const [from, to] of NAPI_REQUIRE_REWRITES) {
    if (!src.includes(from)) continue;
    src = src.split(from).join(to);
    changed += 1;
}
writeFileSync(indexPath, src);
console.log(`patched napi loader requires (${changed} rules hit)`);
