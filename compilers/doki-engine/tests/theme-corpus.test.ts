import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DokiEngine } from "../src/engine";

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

describe.skipIf(themeDirs.length === 0)(
    "Doki theme corpus renders via the host engine",
    () => {
        for (const { rel, dir } of themeDirs) {
            it(rel, () => {
                const engine = new DokiEngine();
                for (const f of readdirSync(dir)) {
                    if (!f.endsWith(".html")) continue;
                    engine.registerTemplate(f, readFileSync(join(dir, f), "utf8"));
                }
                const ctx = {
                    site: {
                        title: "T",
                        lang: "zh",
                        author: "A",
                        description: "D",
                    },
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
                    // Plain string; corpus templates emit `<% content |> safe %>`.
                    content: "<p>hi</p>",
                    now: "2024-06-01T00:00:00.000Z",
                };
                let rendered = false;
                for (const name of ["index", "page", "post", "layout"]) {
                    try {
                        const out = engine.renderTemplate(name, ctx);
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
    },
);
