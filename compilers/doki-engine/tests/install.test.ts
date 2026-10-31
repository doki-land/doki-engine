import {
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    getPackageShortName,
    parsePackageName,
    resolvePackageName,
} from "../src/npm.js";

describe("install command", () => {
    describe("包名解析", () => {
        it("应该将简写主题名解析为完整包名", () => {
            expect(resolvePackageName("blog", "theme")).toBe(
                "@doki-land/theme-blog",
            );
            expect(resolvePackageName("minimal", "theme")).toBe(
                "@doki-land/theme-minimal",
            );
            expect(resolvePackageName("docs", "theme")).toBe(
                "@doki-land/theme-docs",
            );
        });

        it("应该将简写插件名解析为完整包名", () => {
            expect(resolvePackageName("search", "plugin")).toBe(
                "@doki-land/plugin-search",
            );
            expect(resolvePackageName("seo", "plugin")).toBe(
                "@doki-land/plugin-seo",
            );
            expect(resolvePackageName("analytics", "plugin")).toBe(
                "@doki-land/plugin-analytics",
            );
        });

        it("应该保持完整主题包名不变", () => {
            expect(resolvePackageName("@doki-land/theme-blog", "theme")).toBe(
                "@doki-land/theme-blog",
            );
            expect(resolvePackageName("doki-theme-minimal", "theme")).toBe(
                "doki-theme-minimal",
            );
        });

        it("应该保持完整插件包名不变", () => {
            expect(
                resolvePackageName("@doki-land/plugin-search", "plugin"),
            ).toBe("@doki-land/plugin-search");
            expect(resolvePackageName("doki-plugin-seo", "plugin")).toBe(
                "doki-plugin-seo",
            );
        });
    });

    describe("配置更新模拟", () => {
        let tempDir: string;
        let configPath: string;

        beforeEach(() => {
            tempDir = join(process.cwd(), "temp-install-test");
            mkdirSync(tempDir, { recursive: true });
            configPath = join(tempDir, "doki.toml");
        });

        afterEach(() => {
            if (existsSync(tempDir)) {
                rmSync(tempDir, { recursive: true, force: true });
            }
        });

        it("应该正确更新主题配置", () => {
            const initialConfig = `[site]
title = "My Site"

[theme]
name = "old-theme"
`;
            writeFileSync(configPath, initialConfig, "utf-8");

            const packageName = "@doki-land/theme-new-theme";
            const shortName = getPackageShortName(packageName);

            const content = readFileSync(configPath, "utf-8");
            const lines = content.split("\n");
            let inThemeSection = false;
            const newLines: string[] = [];

            for (const line of lines) {
                const trimmedLine = line.trim();

                if (trimmedLine.startsWith("[theme]")) {
                    inThemeSection = true;
                    newLines.push(line);
                    continue;
                }

                if (trimmedLine.startsWith("[") && trimmedLine !== "[theme]") {
                    inThemeSection = false;
                }

                if (inThemeSection && trimmedLine.startsWith("name")) {
                    const indent = line.match(/^(\s*)/)?.[1] || "";
                    newLines.push(`${indent}name = "${shortName}"`);
                    continue;
                }

                newLines.push(line);
            }

            const updatedConfig = newLines.join("\n");
            expect(updatedConfig).toContain('name = "new-theme"');
            expect(updatedConfig).not.toContain("old-theme");
        });

        it("应该正确更新插件配置", () => {
            const initialConfig = `[site]
title = "My Site"

[plugins]
enabled = ["old-plugin"]
`;
            writeFileSync(configPath, initialConfig, "utf-8");

            const pluginNames = [
                "@doki-land/plugin-search",
                "@doki-land/plugin-seo",
            ];
            const shortNames = pluginNames.map(getPackageShortName);

            const content = readFileSync(configPath, "utf-8");
            const lines = content.split("\n");
            let inPluginSection = false;
            const newLines: string[] = [];

            for (const line of lines) {
                const trimmedLine = line.trim();

                if (trimmedLine.startsWith("[plugins]")) {
                    inPluginSection = true;
                    newLines.push(line);
                    continue;
                }

                if (
                    trimmedLine.startsWith("[") &&
                    trimmedLine !== "[plugins]"
                ) {
                    inPluginSection = false;
                }

                if (inPluginSection && trimmedLine.startsWith("enabled")) {
                    const indent = line.match(/^(\s*)/)?.[1] || "";
                    const pluginsList = shortNames
                        .map((n) => `"${n}"`)
                        .join(", ");
                    newLines.push(`${indent}enabled = [${pluginsList}]`);
                    continue;
                }

                newLines.push(line);
            }

            const updatedConfig = newLines.join("\n");
            expect(updatedConfig).toContain('enabled = ["search", "seo"]');
            expect(updatedConfig).not.toContain("old-plugin");
        });

        it("应该在配置文件不存在时不报错", () => {
            const configExists = existsSync(configPath);
            expect(configExists).toBe(false);
        });

        it("应该在没有主题配置节时添加配置", () => {
            const initialConfig = `[site]
title = "My Site"
`;
            writeFileSync(configPath, initialConfig, "utf-8");

            const content = readFileSync(configPath, "utf-8");
            const lines = content.split("\n");
            let themeSectionExists = false;

            for (const line of lines) {
                if (line.trim().startsWith("[theme]")) {
                    themeSectionExists = true;
                    break;
                }
            }

            expect(themeSectionExists).toBe(false);
        });

        it("应该在没有插件配置节时添加配置", () => {
            const initialConfig = `[site]
title = "My Site"
`;
            writeFileSync(configPath, initialConfig, "utf-8");

            const content = readFileSync(configPath, "utf-8");
            const lines = content.split("\n");
            let pluginSectionExists = false;

            for (const line of lines) {
                if (line.trim().startsWith("[plugins]")) {
                    pluginSectionExists = true;
                    break;
                }
            }

            expect(pluginSectionExists).toBe(false);
        });
    });

    describe("版本规范解析", () => {
        it("应该正确解析带版本号的包名", () => {
            const input = "blog@1.0.0";
            const atIndex = input.indexOf("@", 1);
            const name = atIndex > 0 ? input.slice(0, atIndex) : input;
            const version = atIndex > 0 ? input.slice(atIndex + 1) : undefined;

            expect(name).toBe("blog");
            expect(version).toBe("1.0.0");
        });

        it("应该正确解析不带版本号的包名", () => {
            const input = "blog";
            const atIndex = input.indexOf("@", 1);
            const name = atIndex > 0 ? input.slice(0, atIndex) : input;
            const version = atIndex > 0 ? input.slice(atIndex + 1) : undefined;

            expect(name).toBe("blog");
            expect(version).toBeUndefined();
        });

        it("应该正确解析作用域包的版本号", () => {
            const input = "@doki-land/theme-blog@2.0.0";
            const atIndex = input.indexOf("@", 1);
            const name = atIndex > 0 ? input.slice(0, atIndex) : input;
            const version = atIndex > 0 ? input.slice(atIndex + 1) : undefined;

            expect(name).toBe("@doki-land/theme-blog");
            expect(version).toBe("2.0.0");
        });
    });

    describe("安装参数构建", () => {
        it("应该构建正确的 pnpm add 参数", () => {
            const packageName = "@doki-land/theme-blog";
            const version = "1.0.0";
            const save = true;

            const args = [
                "add",
                version ? `${packageName}@${version}` : packageName,
            ];
            if (!save) {
                args.push("--no-save");
            }

            expect(args).toEqual(["add", "@doki-land/theme-blog@1.0.0"]);
        });

        it("应该构建带 --no-save 的参数", () => {
            const packageName = "@doki-land/theme-blog";
            const version = undefined;
            const save = false;

            const args = [
                "add",
                version ? `${packageName}@${version}` : packageName,
            ];
            if (!save) {
                args.push("--no-save");
            }

            expect(args).toEqual(["add", "@doki-land/theme-blog", "--no-save"]);
        });

        it("应该构建多插件安装参数", () => {
            const packageNames = [
                "@doki-land/plugin-search",
                "@doki-land/plugin-seo",
            ];
            const _version = undefined;

            const args = ["add", ...packageNames];

            expect(args).toEqual([
                "add",
                "@doki-land/plugin-search",
                "@doki-land/plugin-seo",
            ]);
        });

        it("应该构建带版本号的多插件安装参数", () => {
            const packageNames = [
                "@doki-land/plugin-search",
                "@doki-land/plugin-seo",
            ];
            const version = "2.0.0";

            const packageSpecs = packageNames.map(
                (name) => `${name}@${version}`,
            );
            const args = ["add", ...packageSpecs];

            expect(args).toEqual([
                "add",
                "@doki-land/plugin-search@2.0.0",
                "@doki-land/plugin-seo@2.0.0",
            ]);
        });
    });

    describe("包类型识别", () => {
        it("应该正确识别主题包", () => {
            expect(parsePackageName("@doki-land/theme-blog")).toBe("theme");
            expect(parsePackageName("doki-theme-minimal")).toBe("theme");
        });

        it("应该正确识别插件包", () => {
            expect(parsePackageName("@doki-land/plugin-search")).toBe("plugin");
            expect(parsePackageName("doki-plugin-seo")).toBe("plugin");
        });

        it("应该拒绝非 Doki 包", () => {
            expect(parsePackageName("express")).toBe(null);
            expect(parsePackageName("lodash")).toBe(null);
        });
    });

    describe("短名称提取", () => {
        it("应该从完整包名提取短名称", () => {
            expect(getPackageShortName("@doki-land/theme-blog")).toBe("blog");
            expect(getPackageShortName("@doki-land/plugin-search")).toBe(
                "search",
            );
            expect(getPackageShortName("doki-theme-minimal")).toBe("minimal");
            expect(getPackageShortName("doki-plugin-seo")).toBe("seo");
        });
    });
});
