#!/usr/bin/env node
// Project the shared Fate blog corpus into the Hexo and Hugo host content trees.
//
// Each host owns a declarative mapping (`<host>/corpus.projection.json`) that
// lists source-relative-path -> target-relative-path inside the host content
// root, plus optional front-matter overrides. Bodies are copied verbatim, only
// the front matter is re-emitted with the host-neutral key set.
//
// Usage:
//   node examples/scripts/project-corpus.mjs           # regenerate
//   node examples/scripts/project-corpus.mjs --check   # verify, write nothing

import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const EXAMPLES_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const CORPUS_DIR = join(EXAMPLES_DIR, "_shared-corpus", "content");
const HOSTS = ["hexo-blog", "hugo-blog"];

const SOURCE_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);
const PRESERVED_KEYS = new Set([
    "title",
    "date",
    "description",
    "tags",
    "cover",
]);
const DOKI_ONLY_KEYS = new Set(["type", "layout"]);
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

function fail(message) {
    console.error(`project-corpus: ${message}`);
    process.exit(1);
}

function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInside(parentAbs, childAbs) {
    const rel = relative(parentAbs, childAbs);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function toPosix(value) {
    return value.split(sep).join("/");
}

function walkFiles(dirAbs) {
    if (!existsSync(dirAbs)) return [];
    const found = [];
    for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
        const entryAbs = join(dirAbs, entry.name);
        if (entry.isDirectory()) found.push(...walkFiles(entryAbs));
        else if (entry.isFile()) found.push(entryAbs);
    }
    return found;
}

function walkMarkdown(dirAbs) {
    return walkFiles(dirAbs).filter((fileAbs) => fileAbs.endsWith(".md"));
}

function loadMapping(host) {
    const hostDir = join(EXAMPLES_DIR, host);
    const mappingPath = join(hostDir, "corpus.projection.json");
    if (!existsSync(mappingPath)) {
        fail(
            `missing mapping file ${toPosix(relative(EXAMPLES_DIR, mappingPath))}`,
        );
    }

    let mapping;
    try {
        mapping = JSON.parse(readFileSync(mappingPath, "utf8"));
    } catch (error) {
        fail(
            `mapping ${toPosix(relative(EXAMPLES_DIR, mappingPath))} is not valid JSON: ${error.message}`,
        );
    }
    if (!isPlainObject(mapping)) {
        fail(
            `mapping ${toPosix(relative(EXAMPLES_DIR, mappingPath))} must be a JSON object`,
        );
    }

    const contentRoot = mapping.contentRoot;
    if (typeof contentRoot !== "string" || contentRoot === "") {
        fail(
            `${host}: "contentRoot" must be a non-empty relative path inside ${host}`,
        );
    }
    const contentRootAbs = resolve(hostDir, contentRoot);
    if (!isInside(hostDir, contentRootAbs)) {
        fail(
            `${host}: "contentRoot" must resolve inside ${host}, got ${contentRoot}`,
        );
    }

    if (!Array.isArray(mapping.entries) || mapping.entries.length === 0) {
        fail(`${host}: "entries" must be a non-empty array`);
    }

    const sources = new Set();
    const targets = new Set();
    const entries = [];
    for (const [index, entry] of mapping.entries.entries()) {
        const label = `${host} entries[${index}]`;
        if (!isPlainObject(entry)) fail(`${label} must be an object`);
        const source = entry.source;
        const target = entry.target;
        if (typeof source !== "string" || source === "") {
            fail(`${label}: "source" must be a non-empty relative path`);
        }
        if (typeof target !== "string" || target === "") {
            fail(`${label}: "target" must be a non-empty relative path`);
        }
        if (!target.endsWith(".md")) {
            fail(`${label}: "target" must end with .md, got ${target}`);
        }
        const sourceKey = toPosix(source);
        const targetKey = toPosix(target);
        if (sources.has(sourceKey))
            fail(`${label}: duplicate source ${sourceKey}`);
        if (targets.has(targetKey))
            fail(`${label}: duplicate target ${targetKey}`);
        sources.add(sourceKey);
        targets.add(targetKey);

        const targetAbs = resolve(contentRootAbs, target);
        if (!isInside(contentRootAbs, targetAbs)) {
            fail(
                `${label}: "target" must resolve inside ${contentRoot}, got ${target}`,
            );
        }

        const overrides = entry.frontMatter ?? {};
        if (!isPlainObject(overrides)) {
            fail(`${label}: "frontMatter" must be an object when present`);
        }
        for (const [key, value] of Object.entries(overrides)) {
            serializeScalar(value, `${label} front matter ${key}`);
        }

        entries.push({ sourceKey, targetKey, targetAbs, overrides });
    }

    return { host, contentRootAbs, entries };
}

function serializeScalar(value, label) {
    if (typeof value === "string") {
        return /^[A-Za-z0-9_./-]+$/.test(value) ? value : JSON.stringify(value);
    }
    if (typeof value === "number" || typeof value === "boolean")
        return String(value);
    if (Array.isArray(value)) {
        const items = value.map((item) => serializeScalar(item, label));
        return `[${items.join(", ")}]`;
    }
    fail(
        `${label}: override values must be strings, numbers, booleans or flat arrays`,
    );
}

function splitFrontMatter(text, label) {
    const match = FRONT_MATTER.exec(text);
    if (!match) fail(`${label}: missing leading front matter block`);
    return { block: match[1], body: text.slice(match[0].length) };
}

function parseFrontMatter(block, label) {
    const entries = [];
    for (const rawLine of block.split("\n")) {
        const line = rawLine.replace(/\r$/, "");
        if (line === "") continue;
        const field = /^([A-Za-z0-9_-]+):(.*)$/.exec(line);
        if (field) {
            entries.push({ key: field[1], lines: [line] });
        } else if (entries.length > 0) {
            entries[entries.length - 1].lines.push(line);
        } else {
            fail(
                `${label}: front matter starts with an unsupported continuation line`,
            );
        }
    }
    for (const entry of entries) {
        if (PRESERVED_KEYS.has(entry.key) || DOKI_ONLY_KEYS.has(entry.key))
            continue;
        fail(
            `${label}: unsupported front-matter key "${entry.key}" (extend the projection model first)`,
        );
    }
    return entries;
}

function renderFrontMatter(entries, overrides, label) {
    const kept = entries
        .filter((entry) => PRESERVED_KEYS.has(entry.key))
        .map((entry) => ({ key: entry.key, lines: [...entry.lines] }));
    const byKey = new Map(kept.map((entry) => [entry.key, entry]));

    for (const [key, value] of Object.entries(overrides)) {
        const line = `${key}: ${serializeScalar(value, `${label} front matter ${key}`)}`;
        const existing = byKey.get(key);
        if (existing) {
            existing.lines = [line];
        } else {
            const entry = { key, lines: [line] };
            kept.push(entry);
            byKey.set(key, entry);
        }
    }

    const lines = kept.flatMap((entry) => entry.lines);
    return `---\n${lines.join("\n")}\n---\n`;
}

function buildOutput(host, entry, corpusFiles) {
    const label = `${host} ${entry.sourceKey}`;
    if (!corpusFiles.has(entry.sourceKey)) {
        fail(
            `${label}: source does not exist under examples/_shared-corpus/content`,
        );
    }
    const text = readFileSync(join(CORPUS_DIR, entry.sourceKey), "utf8");
    const { block, body } = splitFrontMatter(text, label);
    const frontMatter = renderFrontMatter(
        parseFrontMatter(block, label),
        entry.overrides,
        label,
    );
    return frontMatter + body;
}

function removeStaleFiles(host, mapping, targets) {
    const removed = [];
    for (const fileAbs of walkMarkdown(mapping.contentRootAbs)) {
        const key = toPosix(relative(mapping.contentRootAbs, fileAbs));
        if (targets.has(key)) continue;
        if (!isInside(mapping.contentRootAbs, fileAbs)) {
            fail(
                `${host}: refusing to delete ${fileAbs} outside ${toPosix(relative(EXAMPLES_DIR, mapping.contentRootAbs))}`,
            );
        }
        rmSync(fileAbs, { force: true });
        removed.push(key);
    }
    return removed;
}

function main() {
    const args = process.argv.slice(2);
    for (const arg of args) {
        if (arg !== "--check") fail(`unknown argument ${arg}`);
    }
    const checkMode = args.includes("--check");

    if (!existsSync(CORPUS_DIR))
        fail("missing examples/_shared-corpus/content");
    const corpusFiles = new Set(
        walkFiles(CORPUS_DIR).map((fileAbs) =>
            toPosix(relative(CORPUS_DIR, fileAbs)),
        ),
    );
    const corpusSources = new Set(
        [...corpusFiles].filter((key) =>
            SOURCE_EXTENSIONS.has(key.slice(key.lastIndexOf(".")) || ""),
        ),
    );
    if (corpusSources.size === 0)
        fail("no source documents under examples/_shared-corpus/content");

    let failures = 0;
    for (const host of HOSTS) {
        const mapping = loadMapping(host);
        const targets = new Set(
            mapping.entries.map((entry) => entry.targetKey),
        );
        const issues = [];
        let written = 0;

        for (const entry of mapping.entries) {
            const expected = buildOutput(host, entry, corpusSources);
            const exists = existsSync(entry.targetAbs);
            if (checkMode) {
                if (!exists) {
                    issues.push(`missing ${entry.targetKey}`);
                    continue;
                }
                const actual = readFileSync(entry.targetAbs, "utf8");
                if (actual !== expected)
                    issues.push(`different ${entry.targetKey}`);
                continue;
            }
            if (!exists)
                mkdirSync(dirname(entry.targetAbs), { recursive: true });
            if (!exists || readFileSync(entry.targetAbs, "utf8") !== expected) {
                writeFileSync(entry.targetAbs, expected);
                written += 1;
            }
        }

        const stale = checkMode
            ? walkMarkdown(mapping.contentRootAbs)
                  .map((fileAbs) =>
                      toPosix(relative(mapping.contentRootAbs, fileAbs)),
                  )
                  .filter((key) => !targets.has(key))
            : removeStaleFiles(host, mapping, targets);

        if (!checkMode) {
            console.log(
                `${host}: ${written} written, ${stale.length} removed (${mapping.entries.length} file(s))`,
            );
            for (const key of stale) console.log(`  removed ${key}`);
            continue;
        }

        for (const key of stale) issues.push(`stale ${key}`);
        if (issues.length > 0) {
            failures += 1;
            console.error(`${host}: ${issues.length} issue(s)`);
            for (const issue of issues) console.error(`  ${issue}`);
        } else {
            console.log(
                `${host}: up to date (${mapping.entries.length} file(s))`,
            );
        }
    }

    if (checkMode && failures > 0) {
        console.error(
            "project-corpus: generated host content is stale, run node examples/scripts/project-corpus.mjs",
        );
        process.exit(1);
    }
}

main();
