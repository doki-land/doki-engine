import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSupportedExtensions, loadData } from "../src/data";

describe("Data File Loading", () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = join(process.cwd(), `temp-data-test-${Date.now()}`);
        await mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
        await rm(tempDir, { recursive: true, force: true });
    });

    describe("loadData", () => {
        it("should load JSON data file", async () => {
            const jsonPath = join(tempDir, "config.json");
            await writeFile(
                jsonPath,
                JSON.stringify({ name: "test", value: 123 }),
            );

            const result = await loadData(tempDir);

            expect(result.config).toBeDefined();
            expect((result.config as Record<string, unknown>).name).toBe(
                "test",
            );
            expect((result.config as Record<string, unknown>).value).toBe(123);
        });

        it("should load YAML data file", async () => {
            const yamlPath = join(tempDir, "settings.yaml");
            await writeFile(
                yamlPath,
                `title: My Site
description: A test site
count: 42`,
            );

            const result = await loadData(tempDir);

            expect(result.settings).toBeDefined();
            expect((result.settings as Record<string, unknown>).title).toBe(
                "My Site",
            );
            expect(
                (result.settings as Record<string, unknown>).description,
            ).toBe("A test site");
            expect((result.settings as Record<string, unknown>).count).toBe(42);
        });

        it("should load TOML data file", async () => {
            const tomlPath = join(tempDir, "params.toml");
            await writeFile(
                tomlPath,
                `[site]
name = "Doki"
url = "https://example.com"`,
            );

            const result = await loadData(tempDir);

            expect(result.params).toBeDefined();
            const params = result.params as Record<string, unknown>;
            expect(params.site).toBeDefined();
            const site = params.site as Record<string, unknown>;
            expect(site.name).toBe("Doki");
            expect(site.url).toBe("https://example.com");
        });

        it("should load nested directory data", async () => {
            const i18nDir = join(tempDir, "i18n");
            await mkdir(i18nDir, { recursive: true });

            const enPath = join(i18nDir, "en.yaml");
            await writeFile(
                enPath,
                `hello: Hello
goodbye: Goodbye`,
            );

            const zhPath = join(i18nDir, "zh.yaml");
            await writeFile(
                zhPath,
                `hello: 你好
goodbye: 再见`,
            );

            const result = await loadData(tempDir);

            expect(result.i18n).toBeDefined();
            const i18n = result.i18n as Record<string, unknown>;
            expect(i18n.en).toBeDefined();
            expect(i18n.zh).toBeDefined();
            const en = i18n.en as Record<string, unknown>;
            const zh = i18n.zh as Record<string, unknown>;
            expect(en.hello).toBe("Hello");
            expect(zh.hello).toBe("你好");
        });

        it("should return empty object for non-existent directory", async () => {
            const result = await loadData(join(tempDir, "non-existent"));

            expect(result).toEqual({});
        });

        it("should ignore unsupported file extensions", async () => {
            const jsonPath = join(tempDir, "valid.json");
            await writeFile(jsonPath, JSON.stringify({ valid: true }));

            const txtPath = join(tempDir, "readme.txt");
            await writeFile(txtPath, "This should be ignored");

            const mdPath = join(tempDir, "doc.md");
            await writeFile(mdPath, "# Documentation");

            const result = await loadData(tempDir);

            expect(result.valid).toBeDefined();
            expect(result.readme).toBeUndefined();
            expect(result.doc).toBeUndefined();
        });

        it("should load multiple files and merge data", async () => {
            await writeFile(
                join(tempDir, "authors.json"),
                JSON.stringify({ primary: "Alice" }),
            );

            await writeFile(
                join(tempDir, "tags.yaml"),
                `items:
  - rust
  - typescript`,
            );

            const result = await loadData(tempDir);

            expect(result.authors).toBeDefined();
            expect(result.tags).toBeDefined();
            expect((result.authors as Record<string, unknown>).primary).toBe(
                "Alice",
            );
        });

        it("should load .yml extension", async () => {
            const ymlPath = join(tempDir, "data.yml");
            await writeFile(
                ymlPath,
                `key: value
number: 100`,
            );

            const result = await loadData(tempDir);

            expect(result.data).toBeDefined();
            expect((result.data as Record<string, unknown>).key).toBe("value");
            expect((result.data as Record<string, unknown>).number).toBe(100);
        });

        it("should handle empty data directory", async () => {
            const emptyDir = join(tempDir, "empty");
            await mkdir(emptyDir, { recursive: true });

            const result = await loadData(emptyDir);

            expect(result).toEqual({});
        });

        it("should handle deeply nested directories", async () => {
            const deepDir = join(tempDir, "level1", "level2", "level3");
            await mkdir(deepDir, { recursive: true });

            await writeFile(
                join(deepDir, "deep.json"),
                JSON.stringify({ found: true }),
            );

            const result = await loadData(tempDir);

            expect(result.level1).toBeDefined();
            const level1 = result.level1 as Record<string, unknown>;
            expect(level1.level2).toBeDefined();
            const level2 = level1.level2 as Record<string, unknown>;
            expect(level2.level3).toBeDefined();
            const level3 = level2.level3 as Record<string, unknown>;
            expect(level3.deep).toBeDefined();
            const deep = level3.deep as Record<string, unknown>;
            expect(deep.found).toBe(true);
        });
    });

    describe("getSupportedExtensions", () => {
        it("should return supported extensions", () => {
            const extensions = getSupportedExtensions();

            expect(extensions).toContain(".json");
            expect(extensions).toContain(".yaml");
            expect(extensions).toContain(".yml");
            expect(extensions).toContain(".toml");
        });

        it("should return readonly array", () => {
            const extensions = getSupportedExtensions();

            expect(Array.isArray(extensions)).toBe(true);
        });
    });
});
