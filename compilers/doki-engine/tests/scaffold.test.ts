import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    createPlugin,
    createTheme,
    type ScaffoldOptions,
} from "../src/scaffold.js";

describe("scaffold", () => {
    let testDir: string;

    beforeEach(() => {
        testDir = join(process.cwd(), "temp-scaffold-test");
        if (!existsSync(testDir)) {
            mkdirSync(testDir, { recursive: true });
        }
    });

    afterEach(() => {
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe("createTheme", () => {
        it("应该创建主题包结构", async () => {
            const options: ScaffoldOptions = {
                name: "test-theme",
                type: "theme",
                outputDir: testDir,
                author: "Test Author",
                description: "Test theme",
            };

            const result = await createTheme(options);

            expect(result.success).toBe(true);
            expect(result.files.length).toBeGreaterThan(0);
            expect(
                existsSync(join(testDir, "test-theme", "package.json")),
            ).toBe(true);
            expect(existsSync(join(testDir, "test-theme", "theme.toml"))).toBe(
                true,
            );
        });

        it("应该替换 package.json 中的变量", async () => {
            const options: ScaffoldOptions = {
                name: "my-theme",
                type: "theme",
                outputDir: testDir,
                author: "John Doe",
                description: "My custom theme",
            };

            await createTheme(options);

            const packageJson = JSON.parse(
                readFileSync(
                    join(testDir, "my-theme", "package.json"),
                    "utf-8",
                ),
            );

            expect(packageJson.name).toBe("@doki-land/theme-my-theme");
            expect(packageJson.description).toBe("My custom theme");
            expect(packageJson.author).toBe("John Doe");
        });

        it("应该替换 theme.toml 中的变量", async () => {
            const options: ScaffoldOptions = {
                name: "custom-theme",
                type: "theme",
                outputDir: testDir,
                author: "Jane Doe",
                description: "A custom theme",
            };

            await createTheme(options);

            const themeToml = readFileSync(
                join(testDir, "custom-theme", "theme.toml"),
                "utf-8",
            );

            expect(themeToml).toContain('name = "custom-theme"');
            expect(themeToml).toContain('description = "A custom theme"');
            expect(themeToml).toContain('author = "Jane Doe"');
        });

        it("应该创建模板目录", async () => {
            const options: ScaffoldOptions = {
                name: "theme-with-templates",
                type: "theme",
                outputDir: testDir,
            };

            await createTheme(options);

            expect(
                existsSync(join(testDir, "theme-with-templates", "templates")),
            ).toBe(true);
        });

        it("应该创建静态文件目录", async () => {
            const options: ScaffoldOptions = {
                name: "theme-with-static",
                type: "theme",
                outputDir: testDir,
            };

            await createTheme(options);

            expect(
                existsSync(join(testDir, "theme-with-static", "static")),
            ).toBe(true);
        });

        it("应该创建短代码目录", async () => {
            const options: ScaffoldOptions = {
                name: "theme-with-shortcodes",
                type: "theme",
                outputDir: testDir,
            };

            await createTheme(options);

            expect(
                existsSync(
                    join(testDir, "theme-with-shortcodes", "shortcodes"),
                ),
            ).toBe(true);
        });

        it("目录已存在时应该返回失败", async () => {
            mkdirSync(join(testDir, "existing-theme"), { recursive: true });

            const options: ScaffoldOptions = {
                name: "existing-theme",
                type: "theme",
                outputDir: testDir,
            };

            const result = await createTheme(options);

            expect(result.success).toBe(false);
            expect(result.error).toContain("目录已存在");
        });

        it("应该使用默认值填充缺失的选项", async () => {
            const options: ScaffoldOptions = {
                name: "minimal-theme",
                type: "theme",
                outputDir: testDir,
            };

            const result = await createTheme(options);

            expect(result.success).toBe(true);

            const packageJson = JSON.parse(
                readFileSync(
                    join(testDir, "minimal-theme", "package.json"),
                    "utf-8",
                ),
            );

            expect(packageJson.author).toBe("Your Name");
            expect(packageJson.description).toContain("theme");
        });
    });

    describe("createPlugin", () => {
        it("应该创建插件包结构", async () => {
            const options: ScaffoldOptions = {
                name: "test-plugin",
                type: "plugin",
                outputDir: testDir,
                author: "Test Author",
                description: "Test plugin",
            };

            const result = await createPlugin(options);

            expect(result.success).toBe(true);
            expect(
                existsSync(join(testDir, "test-plugin", "package.json")),
            ).toBe(true);
            expect(
                existsSync(join(testDir, "test-plugin", "src", "index.ts")),
            ).toBe(true);
        });

        it("应该替换 package.json 中的变量", async () => {
            const options: ScaffoldOptions = {
                name: "my-plugin",
                type: "plugin",
                outputDir: testDir,
                author: "John Doe",
                description: "My custom plugin",
            };

            await createPlugin(options);

            const packageJson = JSON.parse(
                readFileSync(
                    join(testDir, "my-plugin", "package.json"),
                    "utf-8",
                ),
            );

            expect(packageJson.name).toBe("@doki-land/plugin-my-plugin");
            expect(packageJson.description).toBe("My custom plugin");
            expect(packageJson.author).toBe("John Doe");
        });

        it("应该创建 src 目录", async () => {
            const options: ScaffoldOptions = {
                name: "plugin-with-src",
                type: "plugin",
                outputDir: testDir,
            };

            await createPlugin(options);

            expect(existsSync(join(testDir, "plugin-with-src", "src"))).toBe(
                true,
            );
        });

        it("应该创建测试目录", async () => {
            const options: ScaffoldOptions = {
                name: "plugin-with-tests",
                type: "plugin",
                outputDir: testDir,
            };

            await createPlugin(options);

            expect(
                existsSync(join(testDir, "plugin-with-tests", "tests")),
            ).toBe(true);
        });

        it("应该创建 tsconfig.json", async () => {
            const options: ScaffoldOptions = {
                name: "plugin-tsconfig",
                type: "plugin",
                outputDir: testDir,
            };

            await createPlugin(options);

            expect(
                existsSync(join(testDir, "plugin-tsconfig", "tsconfig.json")),
            ).toBe(true);
        });

        it("应该创建 README.md", async () => {
            const options: ScaffoldOptions = {
                name: "plugin-readme",
                type: "plugin",
                outputDir: testDir,
            };

            await createPlugin(options);

            expect(
                existsSync(join(testDir, "plugin-readme", "README.md")),
            ).toBe(true);
        });

        it("目录已存在时应该返回失败", async () => {
            mkdirSync(join(testDir, "existing-plugin"), { recursive: true });

            const options: ScaffoldOptions = {
                name: "existing-plugin",
                type: "plugin",
                outputDir: testDir,
            };

            const result = await createPlugin(options);

            expect(result.success).toBe(false);
            expect(result.error).toContain("目录已存在");
        });

        it("应该使用默认值填充缺失的选项", async () => {
            const options: ScaffoldOptions = {
                name: "minimal-plugin",
                type: "plugin",
                outputDir: testDir,
            };

            const result = await createPlugin(options);

            expect(result.success).toBe(true);

            const packageJson = JSON.parse(
                readFileSync(
                    join(testDir, "minimal-plugin", "package.json"),
                    "utf-8",
                ),
            );

            expect(packageJson.author).toBe("Your Name");
            expect(packageJson.description).toContain("plugin");
        });
    });

    describe("返回值", () => {
        it("成功时应该返回创建的文件列表", async () => {
            const options: ScaffoldOptions = {
                name: "file-list-theme",
                type: "theme",
                outputDir: testDir,
            };

            const result = await createTheme(options);

            expect(result.success).toBe(true);
            expect(result.path).toBe(join(testDir, "file-list-theme"));
            expect(Array.isArray(result.files)).toBe(true);
            expect(result.files.length).toBeGreaterThan(0);
        });

        it("失败时应该返回错误信息", async () => {
            mkdirSync(join(testDir, "error-theme"), { recursive: true });

            const options: ScaffoldOptions = {
                name: "error-theme",
                type: "theme",
                outputDir: testDir,
            };

            const result = await createTheme(options);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.files).toEqual([]);
        });
    });
});
