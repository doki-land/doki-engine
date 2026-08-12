import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import {
    parsePackageName,
    resolvePackageName,
    checkVersionCompatibility,
    loadPackageManifest,
    getPackagePath,
    getPackageShortName,
    isOfficialPackage,
    discoverPackages,
    type PackageType,
} from "../src/npm.js";

describe("npm package discovery", () => {
    describe("parsePackageName", () => {
        it("应该识别 @doki-land 前缀的主题包", () => {
            expect(parsePackageName("@doki-land/theme-blog")).toBe("theme");
            expect(parsePackageName("@doki-land/theme-minimal")).toBe("theme");
            expect(parsePackageName("@doki-land/theme-docs")).toBe("theme");
        });

        it("应该识别 @doki-land 前缀的插件包", () => {
            expect(parsePackageName("@doki-land/plugin-search")).toBe("plugin");
            expect(parsePackageName("@doki-land/plugin-seo")).toBe("plugin");
            expect(parsePackageName("@doki-land/plugin-analytics")).toBe(
                "plugin",
            );
        });

        it("应该识别 doki-theme- 前缀的主题包", () => {
            expect(parsePackageName("doki-theme-minimal")).toBe("theme");
            expect(parsePackageName("doki-theme-blog")).toBe("theme");
        });

        it("应该识别 doki-plugin- 前缀的插件包", () => {
            expect(parsePackageName("doki-plugin-seo")).toBe("plugin");
            expect(parsePackageName("doki-plugin-search")).toBe("plugin");
        });

        it("对于非 Doki 包应该返回 null", () => {
            expect(parsePackageName("express")).toBe(null);
            expect(parsePackageName("lodash")).toBe(null);
            expect(parsePackageName("@types/node")).toBe(null);
            expect(parsePackageName("react")).toBe(null);
        });

        it("对于部分匹配的包名应该返回 null", () => {
            expect(parsePackageName("doki-themex")).toBe(null);
            expect(parsePackageName("doki-pluginx")).toBe(null);
            expect(parsePackageName("@other/theme-blog")).toBe(null);
        });
    });

    describe("resolvePackageName", () => {
        it("应该解析简写主题名称", () => {
            expect(resolvePackageName("blog", "theme")).toBe(
                "@doki-land/theme-blog",
            );
            expect(resolvePackageName("minimal", "theme")).toBe(
                "@doki-land/theme-minimal",
            );
        });

        it("应该解析简写插件名称", () => {
            expect(resolvePackageName("search", "plugin")).toBe(
                "@doki-land/plugin-search",
            );
            expect(resolvePackageName("seo", "plugin")).toBe(
                "@doki-land/plugin-seo",
            );
        });

        it("应该保持完整包名不变", () => {
            expect(resolvePackageName("@doki-land/theme-blog", "theme")).toBe(
                "@doki-land/theme-blog",
            );
            expect(
                resolvePackageName("@doki-land/plugin-search", "plugin"),
            ).toBe("@doki-land/plugin-search");
        });

        it("应该保持 doki-theme- 前缀不变", () => {
            expect(resolvePackageName("doki-theme-minimal", "theme")).toBe(
                "doki-theme-minimal",
            );
        });

        it("应该保持 doki-plugin- 前缀不变", () => {
            expect(resolvePackageName("doki-plugin-seo", "plugin")).toBe(
                "doki-plugin-seo",
            );
        });
    });

    describe("checkVersionCompatibility", () => {
        it("版本匹配时应该返回兼容", () => {
            const result = checkVersionCompatibility(
                { "@doki-land/doki-engine": "^1.0.0" },
                "1.2.0",
            );
            expect(result.compatible).toBe(true);
            expect(result.warnings).toHaveLength(0);
        });

        it("版本在 ^ 范围内时应该返回兼容", () => {
            const result = checkVersionCompatibility(
                { "@doki-land/doki-engine": "^1.0.0" },
                "1.5.3",
            );
            expect(result.compatible).toBe(true);
            expect(result.warnings).toHaveLength(0);
        });

        it("版本不匹配时应该返回不兼容", () => {
            const result = checkVersionCompatibility(
                { "@doki-land/doki-engine": "^2.0.0" },
                "1.0.0",
            );
            expect(result.compatible).toBe(false);
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it("主版本号不匹配时应该返回不兼容", () => {
            const result = checkVersionCompatibility(
                { "@doki-land/doki-engine": "^2.0.0" },
                "1.9.9",
            );
            expect(result.compatible).toBe(false);
        });

        it("没有对等依赖时应该返回兼容", () => {
            const result = checkVersionCompatibility({}, "1.0.0");
            expect(result.compatible).toBe(true);
            expect(result.warnings).toHaveLength(0);
        });

        it("版本低于要求时应该返回不兼容", () => {
            const result = checkVersionCompatibility(
                { "@doki-land/doki-engine": "^1.5.0" },
                "1.0.0",
            );
            expect(result.compatible).toBe(false);
        });

        it("~ 范围内次版本号匹配时应该返回兼容", () => {
            const result = checkVersionCompatibility(
                { "@doki-land/doki-engine": "~1.2.0" },
                "1.2.5",
            );
            expect(result.compatible).toBe(true);
        });

        it("~ 范围内次版本号不匹配时应该返回不兼容", () => {
            const result = checkVersionCompatibility(
                { "@doki-land/doki-engine": "~1.2.0" },
                "1.3.0",
            );
            expect(result.compatible).toBe(false);
        });

        it("精确版本匹配时应该返回兼容", () => {
            const result = checkVersionCompatibility(
                { "@doki-land/doki-engine": "1.0.0" },
                "1.0.0",
            );
            expect(result.compatible).toBe(true);
        });

        it("精确版本不匹配时应该返回不兼容", () => {
            const result = checkVersionCompatibility(
                { "@doki-land/doki-engine": "1.0.0" },
                "1.0.1",
            );
            expect(result.compatible).toBe(false);
        });
    });

    describe("loadPackageManifest", () => {
        let tempDir: string;

        beforeEach(() => {
            tempDir = join(process.cwd(), "temp-npm-manifest-test");
            mkdirSync(tempDir, { recursive: true });
        });

        afterEach(() => {
            if (existsSync(tempDir)) {
                rmSync(tempDir, { recursive: true, force: true });
            }
        });

        it("应该正确加载有效的 package.json", async () => {
            const manifest = {
                name: "test-package",
                version: "1.0.0",
                description: "Test package",
            };
            writeFileSync(
                join(tempDir, "package.json"),
                JSON.stringify(manifest),
                "utf-8",
            );

            const result = await loadPackageManifest(tempDir);

            expect(result).not.toBeNull();
            expect(result?.name).toBe("test-package");
            expect(result?.version).toBe("1.0.0");
            expect(result?.description).toBe("Test package");
        });

        it("package.json 不存在时应该返回 null", async () => {
            const result = await loadPackageManifest(tempDir);
            expect(result).toBeNull();
        });

        it("缺少 name 字段时应该返回 null", async () => {
            const manifest = { version: "1.0.0" };
            writeFileSync(
                join(tempDir, "package.json"),
                JSON.stringify(manifest),
                "utf-8",
            );

            const result = await loadPackageManifest(tempDir);
            expect(result).toBeNull();
        });

        it("缺少 version 字段时应该返回 null", async () => {
            const manifest = { name: "test-package" };
            writeFileSync(
                join(tempDir, "package.json"),
                JSON.stringify(manifest),
                "utf-8",
            );

            const result = await loadPackageManifest(tempDir);
            expect(result).toBeNull();
        });

        it("无效的 JSON 内容应该返回 null", async () => {
            writeFileSync(
                join(tempDir, "package.json"),
                "invalid json {{{",
                "utf-8",
            );

            const result = await loadPackageManifest(tempDir);
            expect(result).toBeNull();
        });

        it("应该正确加载包含对等依赖的 package.json", async () => {
            const manifest = {
                name: "test-theme",
                version: "1.0.0",
                peerDependencies: {
                    "@doki-land/doki-engine": "^1.0.0",
                },
            };
            writeFileSync(
                join(tempDir, "package.json"),
                JSON.stringify(manifest),
                "utf-8",
            );

            const result = await loadPackageManifest(tempDir);

            expect(result).not.toBeNull();
            expect(result?.peerDependencies).toEqual({
                "@doki-land/doki-engine": "^1.0.0",
            });
        });
    });

    describe("getPackagePath", () => {
        let tempDir: string;
        let nodeModulesDir: string;

        beforeEach(() => {
            tempDir = join(process.cwd(), "temp-npm-path-test");
            nodeModulesDir = join(tempDir, "node_modules");
            mkdirSync(nodeModulesDir, { recursive: true });
        });

        afterEach(() => {
            if (existsSync(tempDir)) {
                rmSync(tempDir, { recursive: true, force: true });
            }
        });

        it("应该找到作用域包的路径", () => {
            const scopedDir = join(nodeModulesDir, "@doki-land", "theme-blog");
            mkdirSync(scopedDir, { recursive: true });

            const result = getPackagePath("@doki-land/theme-blog", tempDir);
            expect(result).toBe(scopedDir);
        });

        it("应该找到普通包的路径", () => {
            const normalDir = join(nodeModulesDir, "doki-theme-minimal");
            mkdirSync(normalDir, { recursive: true });

            const result = getPackagePath("doki-theme-minimal", tempDir);
            expect(result).toBe(normalDir);
        });

        it("包不存在时应该返回 null", () => {
            const result = getPackagePath("nonexistent-package", tempDir);
            expect(result).toBeNull();
        });

        it("node_modules 不存在时应该返回 null", () => {
            rmSync(nodeModulesDir, { recursive: true, force: true });
            const result = getPackagePath("some-package", tempDir);
            expect(result).toBeNull();
        });
    });

    describe("getPackageShortName", () => {
        it("应该从 @doki-land/theme- 前缀提取短名称", () => {
            expect(getPackageShortName("@doki-land/theme-blog")).toBe("blog");
            expect(getPackageShortName("@doki-land/theme-minimal")).toBe(
                "minimal",
            );
        });

        it("应该从 @doki-land/plugin- 前缀提取短名称", () => {
            expect(getPackageShortName("@doki-land/plugin-search")).toBe(
                "search",
            );
            expect(getPackageShortName("@doki-land/plugin-seo")).toBe("seo");
        });

        it("应该从 doki-theme- 前缀提取短名称", () => {
            expect(getPackageShortName("doki-theme-minimal")).toBe("minimal");
        });

        it("应该从 doki-plugin- 前缀提取短名称", () => {
            expect(getPackageShortName("doki-plugin-seo")).toBe("seo");
        });

        it("对于不匹配前缀的包名应该返回原名称", () => {
            expect(getPackageShortName("express")).toBe("express");
            expect(getPackageShortName("lodash")).toBe("lodash");
        });
    });

    describe("isOfficialPackage", () => {
        it("官方包应该返回 true", () => {
            expect(isOfficialPackage("@doki-land/theme-blog")).toBe(true);
            expect(isOfficialPackage("@doki-land/plugin-search")).toBe(true);
            expect(isOfficialPackage("@doki-land/doki-engine")).toBe(true);
        });

        it("非官方包应该返回 false", () => {
            expect(isOfficialPackage("doki-theme-minimal")).toBe(false);
            expect(isOfficialPackage("doki-plugin-seo")).toBe(false);
            expect(isOfficialPackage("express")).toBe(false);
        });
    });

    describe("discoverPackages", () => {
        let tempDir: string;
        let nodeModulesDir: string;

        beforeEach(() => {
            tempDir = join(process.cwd(), "temp-npm-discover-test");
            nodeModulesDir = join(tempDir, "node_modules");
            mkdirSync(nodeModulesDir, { recursive: true });
        });

        afterEach(() => {
            if (existsSync(tempDir)) {
                rmSync(tempDir, { recursive: true, force: true });
            }
        });

        it("应该发现作用域主题包", async () => {
            const themeDir = join(nodeModulesDir, "@doki-land", "theme-blog");
            mkdirSync(themeDir, { recursive: true });

            const manifest = {
                name: "@doki-land/theme-blog",
                version: "1.0.0",
            };
            writeFileSync(
                join(themeDir, "package.json"),
                JSON.stringify(manifest),
                "utf-8",
            );
            writeFileSync(
                join(themeDir, "theme.toml"),
                'name = "blog"\nversion = "1.0.0"',
                "utf-8",
            );

            const packages = await discoverPackages({
                cwd: tempDir,
                types: ["theme"],
            });

            expect(packages.length).toBe(1);
            expect(packages[0].name).toBe("@doki-land/theme-blog");
            expect(packages[0].type).toBe("theme");
        });

        it("应该发现作用域插件包", async () => {
            const pluginDir = join(
                nodeModulesDir,
                "@doki-land",
                "plugin-search",
            );
            mkdirSync(pluginDir, { recursive: true });

            const manifest = {
                name: "@doki-land/plugin-search",
                version: "1.0.0",
            };
            writeFileSync(
                join(pluginDir, "package.json"),
                JSON.stringify(manifest),
                "utf-8",
            );
            writeFileSync(
                join(pluginDir, "index.js"),
                "module.exports = {};",
                "utf-8",
            );

            const packages = await discoverPackages({
                cwd: tempDir,
                types: ["plugin"],
            });

            expect(packages.length).toBe(1);
            expect(packages[0].name).toBe("@doki-land/plugin-search");
            expect(packages[0].type).toBe("plugin");
        });

        it("应该发现普通主题包", async () => {
            const themeDir = join(nodeModulesDir, "doki-theme-minimal");
            mkdirSync(themeDir, { recursive: true });

            const manifest = {
                name: "doki-theme-minimal",
                version: "1.0.0",
            };
            writeFileSync(
                join(themeDir, "package.json"),
                JSON.stringify(manifest),
                "utf-8",
            );
            writeFileSync(
                join(themeDir, "theme.toml"),
                'name = "minimal"\nversion = "1.0.0"',
                "utf-8",
            );

            const packages = await discoverPackages({
                cwd: tempDir,
                types: ["theme"],
            });

            expect(packages.length).toBe(1);
            expect(packages[0].name).toBe("doki-theme-minimal");
        });

        it("应该发现普通插件包", async () => {
            const pluginDir = join(nodeModulesDir, "doki-plugin-seo");
            mkdirSync(pluginDir, { recursive: true });

            const manifest = {
                name: "doki-plugin-seo",
                version: "1.0.0",
            };
            writeFileSync(
                join(pluginDir, "package.json"),
                JSON.stringify(manifest),
                "utf-8",
            );
            writeFileSync(
                join(pluginDir, "index.ts"),
                "export default {}",
                "utf-8",
            );

            const packages = await discoverPackages({
                cwd: tempDir,
                types: ["plugin"],
            });

            expect(packages.length).toBe(1);
            expect(packages[0].name).toBe("doki-plugin-seo");
        });

        it("node_modules 不存在时应该返回空数组", async () => {
            rmSync(nodeModulesDir, { recursive: true, force: true });
            const packages = await discoverPackages({ cwd: tempDir });
            expect(packages).toEqual([]);
        });

        it("应该同时发现主题和插件", async () => {
            const themeDir = join(nodeModulesDir, "@doki-land", "theme-blog");
            mkdirSync(themeDir, { recursive: true });
            writeFileSync(
                join(themeDir, "package.json"),
                JSON.stringify({
                    name: "@doki-land/theme-blog",
                    version: "1.0.0",
                }),
                "utf-8",
            );
            writeFileSync(
                join(themeDir, "theme.toml"),
                'name = "blog"\nversion = "1.0.0"',
                "utf-8",
            );

            const pluginDir = join(
                nodeModulesDir,
                "@doki-land",
                "plugin-search",
            );
            mkdirSync(pluginDir, { recursive: true });
            writeFileSync(
                join(pluginDir, "package.json"),
                JSON.stringify({
                    name: "@doki-land/plugin-search",
                    version: "1.0.0",
                }),
                "utf-8",
            );
            writeFileSync(join(pluginDir, "index.js"), "", "utf-8");

            const packages = await discoverPackages({ cwd: tempDir });

            expect(packages.length).toBe(2);
            const types = packages.map((p) => p.type);
            expect(types).toContain("theme");
            expect(types).toContain("plugin");
        });

        it("应该过滤掉无效的包结构", async () => {
            const invalidThemeDir = join(
                nodeModulesDir,
                "@doki-land",
                "theme-invalid",
            );
            mkdirSync(invalidThemeDir, { recursive: true });
            writeFileSync(
                join(invalidThemeDir, "package.json"),
                JSON.stringify({
                    name: "@doki-land/theme-invalid",
                    version: "1.0.0",
                }),
                "utf-8",
            );

            const packages = await discoverPackages({
                cwd: tempDir,
                types: ["theme"],
            });
            expect(packages).toEqual([]);
        });
    });
});
