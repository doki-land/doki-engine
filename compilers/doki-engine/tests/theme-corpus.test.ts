import { describe, expect, it } from "vitest";
import { DejavuEngine, DejavuLanguage, markSafe } from "@doki-land/dejavu-engine";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Doki product delimiters — belong in Doki, not upstream Dejavu. */
const dokiLanguage = new DejavuLanguage().withTemplate({
    codeStart: "{%",
    codeEnd: "%}",
    commentStart: "{#",
    commentEnd: "#}",
    supportFilterPipe: true,
    legacyFor: false,
});

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const themeRelDirs = [
    "examples/example-theme/templates",
    "packages/theme-template/templates",
    "examples/static-site/templates",
    "examples/docs-site/templates",
    "examples/blog-site/templates",
    "themes/default/templates",
    "examples/mvp-site/templates",
    "examples/init-site/templates",
];

const themeDirs = themeRelDirs
    .map((rel) => ({ rel, dir: join(repoRoot, rel) }))
    .filter(({ dir }) => existsSync(dir));

describe.skipIf(themeDirs.length === 0)("Doki theme corpus parses via host adapter", () => {
    for (const { rel, dir } of themeDirs) {
        it(rel, () => {
            const eng = new DejavuEngine({ language: dokiLanguage });
            for (const f of readdirSync(dir)) {
                if (!f.endsWith(".html")) continue;
                const src = readFileSync(join(dir, f), "utf8");
                eng.registerTemplate(f, src);
                eng.registerTemplate(f.replace(/\.html$/i, ""), src);
            }
            const ctx = {
                site: { title: "T", lang: "zh", author: "A", description: "D" },
                page: {
                    title: "P",
                    date: "2024-01-15",
                    author: "A",
                    tags: ["x"],
                    url: "/",
                    summary: "s",
                },
                pages: [
                    {
                        title: "P",
                        date: "2024-01-15",
                        author: "A",
                        tags: ["x"],
                        url: "/",
                        description: "e",
                        excerpt: "ex",
                    },
                ],
                content: markSafe("<p>hi</p>"),
                now: "2024-06-01T00:00:00.000Z",
            };
            let rendered = false;
            for (const name of ["index", "page", "post", "layout"]) {
                try {
                    const out = eng.renderTemplate(name, ctx);
                    expect(out.length).toBeGreaterThan(0);
                    rendered = true;
                    break;
                } catch (e) {
                    if (String(e).includes("not found")) continue;
                    throw e;
                }
            }
            expect(rendered).toBe(true);
        });
    }
});
