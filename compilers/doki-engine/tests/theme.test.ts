import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import {
    ThemeLoader,
    ThemeManager,
    loadThemeManifest,
    themeExists,
    parseThemeConfig,
    findAvailableThemes,
    type ThemeManifest,
} from "../src/theme";

describe("ThemeLoader", () => {
    let tempDir: string;
    let themesDir: string;
    let themePath: string;

    beforeEach(() => {
        tempDir = join(process.cwd(), "temp-theme-test");
        themesDir = join(tempDir, "themes");
        themePath = join(themesDir, "test-theme");

        mkdirSync(themePath, { recursive: true });
        mkdirSync(join(themePath, "templates"), { recursive: true });
    });

    afterEach(() => {
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe("类实例化", () => {
        it("应该正确创建 ThemeLoader 实例", () => {
            const loader = new ThemeLoader("test-theme", themesDir);
            expect(loader).toBeInstanceOf(ThemeLoader);
        });

        it("应该正确设置主题路径", () => {
            const loader = new ThemeLoader("my-theme", themesDir);
            expect(loader.getTemplatesDir()).toBe(
                join(themesDir, "my-theme", "templates"),
            );
            expect(loader.getStaticDir()).toBe(
                join(themesDir, "my-theme", "static"),
            );
        });
    });

    describe("exists 方法", () => {
        it("存在 theme.toml 时应该返回 true", () => {
            writeFileSync(
                join(themePath, "theme.toml"),
                'name = "test"\nversion = "1.0.0"',
                "utf-8",
            );

            const loader = new ThemeLoader("test-theme", themesDir);
            expect(loader.exists()).toBe(true);
        });

        it("不存在 theme.toml 时应该返回 false", () => {
            const loader = new ThemeLoader("test-theme", themesDir);
            expect(loader.exists()).toBe(false);
        });

        it("主题目录不存在时应该返回 false", () => {
            const loader = new ThemeLoader("nonexistent", themesDir);
            expect(loader.exists()).toBe(false);
        });
    });

    describe("loadConfig 方法", () => {
        it("应该正确加载有效的主题配置", async () => {
            const manifestContent = `
name = "test-theme"
version = "1.0.0"
description = "A test theme"
author = "Test Author"
`;
            writeFileSync(
                join(themePath, "theme.toml"),
                manifestContent,
                "utf-8",
            );

            const loader = new ThemeLoader("test-theme", themesDir);
            const config = await loader.loadConfig();

            expect(config).not.toBeNull();
            expect(config?.name).toBe("test-theme");
            expect(config?.version).toBe("1.0.0");
            expect(config?.description).toBe("A test theme");
            expect(config?.author).toBe("Test Author");
        });

        it("缺少 name 字段时应该返回 null", async () => {
            const manifestContent = 'version = "1.0.0"';
            writeFileSync(
                join(themePath, "theme.toml"),
                manifestContent,
                "utf-8",
            );

            const loader = new ThemeLoader("test-theme", themesDir);
            const config = await loader.loadConfig();

            expect(config).toBeNull();
        });

        it("缺少 version 字段时应该返回 null", async () => {
            const manifestContent = 'name = "test-theme"';
            writeFileSync(
                join(themePath, "theme.toml"),
                manifestContent,
                "utf-8",
            );

            const loader = new ThemeLoader("test-theme", themesDir);
            const config = await loader.loadConfig();

            expect(config).toBeNull();
        });

        it("theme.toml 不存在时应该返回 null", async () => {
            const loader = new ThemeLoader("test-theme", themesDir);
            const config = await loader.loadConfig();

            expect(config).toBeNull();
        });

        it("无效的 TOML 内容应该返回 null", async () => {
            writeFileSync(
                join(themePath, "theme.toml"),
                "invalid toml content [[[[",
                "utf-8",
            );

            const loader = new ThemeLoader("test-theme", themesDir);
            const config = await loader.loadConfig();

            expect(config).toBeNull();
        });
    });

    describe("getTemplatesDir 方法", () => {
        it("应该返回正确的模板目录路径", () => {
            const loader = new ThemeLoader("my-theme", themesDir);
            expect(loader.getTemplatesDir()).toBe(
                join(themesDir, "my-theme", "templates"),
            );
        });
    });

    describe("getStaticDir 方法", () => {
        it("应该返回正确的静态文件目录路径", () => {
            const loader = new ThemeLoader("my-theme", themesDir);
            expect(loader.getStaticDir()).toBe(
                join(themesDir, "my-theme", "static"),
            );
        });
    });

    describe("listTemplates 方法", () => {
        it("应该列出所有 .html 模板文件", async () => {
            writeFileSync(
                join(themePath, "theme.toml"),
                'name = "test"\nversion = "1.0.0"',
                "utf-8",
            );
            writeFileSync(
                join(themePath, "templates", "index.html"),
                "",
                "utf-8",
            );
            writeFileSync(
                join(themePath, "templates", "post.html"),
                "",
                "utf-8",
            );

            const loader = new ThemeLoader("test-theme", themesDir);
            const templates = await loader.listTemplates();

            expect(templates).toContain("index.html");
            expect(templates).toContain("post.html");
        });

        it("应该列出所有 .doki 模板文件", async () => {
            writeFileSync(
                join(themePath, "theme.toml"),
                'name = "test"\nversion = "1.0.0"',
                "utf-8",
            );
            writeFileSync(
                join(themePath, "templates", "page.doki"),
                "",
                "utf-8",
            );
            writeFileSync(
                join(themePath, "templates", "layout.doki"),
                "",
                "utf-8",
            );

            const loader = new ThemeLoader("test-theme", themesDir);
            const templates = await loader.listTemplates();

            expect(templates).toContain("page.doki");
            expect(templates).toContain("layout.doki");
        });

        it("模板目录不存在时应该返回空数组", async () => {
            writeFileSync(
                join(themePath, "theme.toml"),
                'name = "test"\nversion = "1.0.0"',
                "utf-8",
            );
            rmSync(join(themePath, "templates"), {
                recursive: true,
                force: true,
            });

            const loader = new ThemeLoader("test-theme", themesDir);
            const templates = await loader.listTemplates();

            expect(templates).toEqual([]);
        });

        it("不应该列出非模板文件", async () => {
            writeFileSync(
                join(themePath, "theme.toml"),
                'name = "test"\nversion = "1.0.0"',
                "utf-8",
            );
            writeFileSync(
                join(themePath, "templates", "index.html"),
                "",
                "utf-8",
            );
            writeFileSync(
                join(themePath, "templates", "readme.txt"),
                "",
                "utf-8",
            );
            writeFileSync(
                join(themePath, "templates", "data.json"),
                "",
                "utf-8",
            );

            const loader = new ThemeLoader("test-theme", themesDir);
            const templates = await loader.listTemplates();

            expect(templates).toContain("index.html");
            expect(templates).not.toContain("readme.txt");
            expect(templates).not.toContain("data.json");
        });
    });
});

describe("loadThemeManifest", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = join(process.cwd(), "temp-manifest-test");
        mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("应该正确加载主题清单", async () => {
        const manifestContent = `
name = "awesome-theme"
version = "2.0.0"
description = "An awesome theme"
author = "Developer"
homepage = "https://example.com"
repository = "https://github.com/example/theme"
license = "MIT"
tags = ["blog", "minimal"]
`;
        writeFileSync(join(tempDir, "theme.toml"), manifestContent, "utf-8");

        const manifest = await loadThemeManifest(tempDir);

        expect(manifest).not.toBeNull();
        expect(manifest?.name).toBe("awesome-theme");
        expect(manifest?.version).toBe("2.0.0");
        expect(manifest?.description).toBe("An awesome theme");
        expect(manifest?.author).toBe("Developer");
        expect(manifest?.homepage).toBe("https://example.com");
        expect(manifest?.repository).toBe("https://github.com/example/theme");
        expect(manifest?.license).toBe("MIT");
        expect(manifest?.tags).toEqual(["blog", "minimal"]);
    });

    it("theme.toml 不存在时应该返回 null", async () => {
        const manifest = await loadThemeManifest(tempDir);
        expect(manifest).toBeNull();
    });

    it("缺少必需字段时应该返回 null", async () => {
        writeFileSync(
            join(tempDir, "theme.toml"),
            'description = "No name or version"',
            "utf-8",
        );

        const manifest = await loadThemeManifest(tempDir);
        expect(manifest).toBeNull();
    });
});

describe("themeExists", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = join(process.cwd(), "temp-exists-test");
        mkdirSync(tempDir, { recursive: true });
    });

    afterEach(() => {
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("有效主题应该返回 true", async () => {
        writeFileSync(
            join(tempDir, "theme.toml"),
            'name = "test"\nversion = "1.0.0"',
            "utf-8",
        );

        const exists = await themeExists(tempDir);
        expect(exists).toBe(true);
    });

    it("无效主题应该返回 false", async () => {
        const exists = await themeExists(tempDir);
        expect(exists).toBe(false);
    });
});

describe("parseThemeConfig", () => {
    it("应该正确解析有效的主题配置", () => {
        const content = `
name = "parsed-theme"
version = "3.0.0"
description = "Parsed theme"
`;
        const manifest = parseThemeConfig(content);

        expect(manifest.name).toBe("parsed-theme");
        expect(manifest.version).toBe("3.0.0");
        expect(manifest.description).toBe("Parsed theme");
    });

    it("缺少 name 字段时应该抛出错误", () => {
        const content = 'version = "1.0.0"';

        expect(() => parseThemeConfig(content)).toThrow(
            "Theme config missing required field: name",
        );
    });

    it("缺少 version 字段时应该抛出错误", () => {
        const content = 'name = "test"';

        expect(() => parseThemeConfig(content)).toThrow(
            "Theme config missing required field: version",
        );
    });
});

describe("findAvailableThemes", () => {
    let tempDir: string;
    let themesDir: string;

    beforeEach(() => {
        tempDir = join(process.cwd(), "temp-find-test");
        themesDir = join(tempDir, "themes");
        mkdirSync(themesDir, { recursive: true });
    });

    afterEach(() => {
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("应该找到所有可用主题", async () => {
        const theme1 = join(themesDir, "theme-a");
        const theme2 = join(themesDir, "theme-b");
        mkdirSync(theme1, { recursive: true });
        mkdirSync(theme2, { recursive: true });

        writeFileSync(
            join(theme1, "theme.toml"),
            'name = "theme-a"\nversion = "1.0.0"',
            "utf-8",
        );
        writeFileSync(
            join(theme2, "theme.toml"),
            'name = "theme-b"\nversion = "1.0.0"',
            "utf-8",
        );

        const themes = await findAvailableThemes(themesDir);

        expect(themes).toContain("theme-a");
        expect(themes).toContain("theme-b");
        expect(themes).toHaveLength(2);
    });

    it("不应该包含没有 theme.toml 的目录", async () => {
        const validTheme = join(themesDir, "valid");
        const invalidTheme = join(themesDir, "invalid");
        mkdirSync(validTheme, { recursive: true });
        mkdirSync(invalidTheme, { recursive: true });

        writeFileSync(
            join(validTheme, "theme.toml"),
            'name = "valid"\nversion = "1.0.0"',
            "utf-8",
        );

        const themes = await findAvailableThemes(themesDir);

        expect(themes).toContain("valid");
        expect(themes).not.toContain("invalid");
    });

    it("主题目录不存在时应该返回空数组", async () => {
        rmSync(themesDir, { recursive: true, force: true });

        const themes = await findAvailableThemes(themesDir);
        expect(themes).toEqual([]);
    });
});

describe("ThemeManager", () => {
    let tempDir: string;
    let themesDir: string;
    let manager: ThemeManager;

    beforeEach(() => {
        tempDir = join(process.cwd(), "temp-manager-test");
        themesDir = join(tempDir, "themes");
        const themePath = join(themesDir, "test-theme");

        mkdirSync(join(themePath, "templates"), { recursive: true });
        mkdirSync(join(themePath, "static"), { recursive: true });
        mkdirSync(join(themePath, "shortcodes"), { recursive: true });

        writeFileSync(
            join(themePath, "theme.toml"),
            'name = "test-theme"\nversion = "1.0.0"',
            "utf-8",
        );
        writeFileSync(
            join(themePath, "templates", "index.html"),
            "<html></html>",
            "utf-8",
        );

        manager = new ThemeManager();
    });

    afterEach(() => {
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe("loadTheme", () => {
        it("应该正确加载主题", async () => {
            const themeConfig = { name: "test-theme" };
            const theme = await manager.loadTheme(themeConfig, tempDir);

            expect(theme).not.toBeNull();
            expect(theme?.manifest.name).toBe("test-theme");
            expect(theme?.path).toBe(join(themesDir, "test-theme"));
        });

        it("使用路径配置时应该正确加载主题", async () => {
            const themeConfig = { path: join(themesDir, "test-theme") };
            const theme = await manager.loadTheme(themeConfig, tempDir);

            expect(theme).not.toBeNull();
            expect(theme?.manifest.name).toBe("test-theme");
        });

        it("主题不存在时应该返回 null", async () => {
            const themeConfig = { name: "nonexistent" };
            const theme = await manager.loadTheme(themeConfig, tempDir);

            expect(theme).toBeNull();
        });
    });

    describe("getTheme", () => {
        it("未加载主题时应该返回 null", () => {
            expect(manager.getTheme()).toBeNull();
        });

        it("加载后应该返回主题对象", async () => {
            await manager.loadTheme({ name: "test-theme" }, tempDir);
            const theme = manager.getTheme();

            expect(theme).not.toBeNull();
            expect(theme?.manifest.name).toBe("test-theme");
        });
    });

    describe("mergeThemeConfig", () => {
        it("应该正确合并配置", () => {
            const userConfig = { title: "My Site", lang: "en" };
            const themeDefaults = { lang: "zh", paginate: 10 };

            const merged = manager.mergeThemeConfig(
                userConfig as any,
                themeDefaults,
            );

            expect(merged.title).toBe("My Site");
            expect(merged.lang).toBe("en");
            expect((merged as any).paginate).toBe(10);
        });
    });

    describe("getThemeTemplates", () => {
        it("应该返回主题模板映射", async () => {
            await manager.loadTheme({ name: "test-theme" }, tempDir);
            const templates = await manager.getThemeTemplates();

            expect(templates.size).toBeGreaterThan(0);
            expect(templates.has("index.html")).toBe(true);
        });

        it("未加载主题时应该返回空映射", async () => {
            const templates = await manager.getThemeTemplates();
            expect(templates.size).toBe(0);
        });
    });

    describe("getThemeStaticDir", () => {
        it("应该返回静态文件目录", async () => {
            await manager.loadTheme({ name: "test-theme" }, tempDir);
            const staticDir = manager.getThemeStaticDir();

            expect(staticDir).toBe(join(themesDir, "test-theme", "static"));
        });

        it("未加载主题时应该返回 null", () => {
            expect(manager.getThemeStaticDir()).toBeNull();
        });
    });

    describe("getThemeShortcodesDir", () => {
        it("应该返回短代码目录", async () => {
            await manager.loadTheme({ name: "test-theme" }, tempDir);
            const shortcodesDir = manager.getThemeShortcodesDir();

            expect(shortcodesDir).toBe(
                join(themesDir, "test-theme", "shortcodes"),
            );
        });

        it("未加载主题时应该返回 null", () => {
            expect(manager.getThemeShortcodesDir()).toBeNull();
        });
    });

    describe("resolveThemeTemplate", () => {
        it("应该解析存在的模板", async () => {
            await manager.loadTheme({ name: "test-theme" }, tempDir);
            const resolved = manager.resolveThemeTemplate("index.html");

            expect(resolved).toBe(
                join(themesDir, "test-theme", "templates", "index.html"),
            );
        });

        it("应该自动添加 .html 扩展名", async () => {
            await manager.loadTheme({ name: "test-theme" }, tempDir);
            const resolved = manager.resolveThemeTemplate("index");

            expect(resolved).toBe(
                join(themesDir, "test-theme", "templates", "index.html"),
            );
        });

        it("不存在的模板应该返回 null", async () => {
            await manager.loadTheme({ name: "test-theme" }, tempDir);
            const resolved = manager.resolveThemeTemplate("nonexistent");

            expect(resolved).toBeNull();
        });

        it("未加载主题时应该返回 null", () => {
            expect(manager.resolveThemeTemplate("index")).toBeNull();
        });
    });
});
