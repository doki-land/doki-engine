/** Doki Engine 主题系统 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { parse } from "smol-toml";
import type { DokiConfig, ThemeConfig } from "./config.js";
import {
    type DiscoveredPackage,
    discoverPackages,
    getPackagePath,
    resolvePackageName,
} from "./npm.js";

/** 主题清单 */
export interface ThemeManifest {
    /** 主题名称 */
    name: string;
    /** 主题版本 */
    version: string;
    /** 主题描述 */
    description?: string;
    /** 主题作者 */
    author?: string;
    /** 主题主页 */
    homepage?: string;
    /** 主题仓库 */
    repository?: string;
    /** 主题许可证 */
    license?: string;
    /** 主题标签 */
    tags?: string[];
    /** 主题配置默认值 */
    config?: Record<string, unknown>;
    /** 支持的短代码 */
    shortcodes?: string[];
}

/** 主题定义 */
export interface Theme {
    /** 主题清单 */
    manifest: ThemeManifest;
    /** 主题路径 */
    path: string;
    /** 模板目录路径 */
    templatesDir: string;
    /** 静态资源目录路径 */
    staticDir: string;
    /** 短代码目录路径 */
    shortcodesDir: string;
}

/**
 * 加载主题清单
 * @param themePath 主题路径
 * @returns 主题清单对象，如果加载失败则返回 null
 */
export async function loadThemeManifest(
    themePath: string,
): Promise<ThemeManifest | null> {
    const manifestPath = join(themePath, "theme.toml");

    if (!existsSync(manifestPath)) {
        return null;
    }

    try {
        const content = await readFile(manifestPath, "utf-8");
        const parsed = parse(content) as unknown as ThemeManifest;

        if (!parsed.name || !parsed.version) {
            console.warn(
                `Theme manifest missing required fields: ${manifestPath}`,
            );
            return null;
        }

        return parsed;
    } catch (error) {
        console.error(`Failed to parse theme manifest: ${manifestPath}`);
        console.error((error as Error).message);
        return null;
    }
}

/**
 * 检查主题是否存在
 * @param themePath 主题路径
 * @returns 主题是否存在
 */
export async function themeExists(themePath: string): Promise<boolean> {
    try {
        const manifest = await loadThemeManifest(themePath);
        return manifest !== null;
    } catch {
        return false;
    }
}

/**
 * 读取目录中的所有模板文件
 * @param dir 目录路径
 * @param baseDir 基础目录路径
 * @param templates 模板映射
 */
async function readTemplatesRecursively(
    dir: string,
    baseDir: string,
    templates: Map<string, string>,
): Promise<void> {
    try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                await readTemplatesRecursively(fullPath, baseDir, templates);
            } else if (
                entry.isFile() &&
                (entry.name.endsWith(".html") || entry.name.endsWith(".doki"))
            ) {
                const relativePath = fullPath.slice(baseDir.length + 1);
                templates.set(relativePath, fullPath);
            }
        }
    } catch (_error) {
        console.warn(`Failed to read templates directory: ${dir}`);
    }
}

/** 主题管理器 */
export class ThemeManager {
    private theme: Theme | null = null;

    /** 已发现的 npm 主题映射 */
    private npmThemes: Map<string, DiscoveredPackage> = new Map();

    /**
     * 创建主题管理器实例
     */
    constructor() {
        this.theme = null;
        this.npmThemes = new Map();
    }

    /**
     * 从 npm 包加载主题
     * @param packageName 包名（支持简写）
     * @param projectDir 项目目录
     * @returns 加载的主题对象，如果加载失败则返回 null
     */
    async loadThemeFromNpm(
        packageName: string,
        projectDir: string,
    ): Promise<Theme | null> {
        const fullName = resolvePackageName(packageName, "theme");

        const packagePath = getPackagePath(fullName, projectDir);
        if (!packagePath) {
            console.warn(`Theme package not found: ${fullName}`);
            return null;
        }

        const manifest = await loadThemeManifest(packagePath);
        if (!manifest) {
            console.warn(`Invalid theme package: ${fullName}`);
            return null;
        }

        this.theme = {
            manifest,
            path: packagePath,
            templatesDir: join(packagePath, "templates"),
            staticDir: join(packagePath, "static"),
            shortcodesDir: join(packagePath, "shortcodes"),
        };

        return this.theme;
    }

    /**
     * 发现已安装的 npm 主题
     * @param projectDir 项目目录
     * @returns 发现的 npm 主题列表
     */
    async discoverNpmThemes(projectDir: string): Promise<DiscoveredPackage[]> {
        const packages = await discoverPackages({
            cwd: projectDir,
            types: ["theme"],
        });

        for (const pkg of packages) {
            this.npmThemes.set(pkg.name, pkg);
        }

        return packages;
    }

    /**
     * 加载主题（自动检测本地或 npm）
     * @param themeConfig 主题配置
     * @param projectDir 项目目录
     * @returns 加载的主题对象，如果加载失败则返回 null
     */
    async loadTheme(
        themeConfig: ThemeConfig,
        projectDir: string,
    ): Promise<Theme | null> {
        if (themeConfig.path) {
            return this.loadThemeFromPath(themeConfig.path, projectDir);
        }

        if (themeConfig.name) {
            const theme = await this.loadThemeFromNpm(
                themeConfig.name,
                projectDir,
            );
            if (theme) return theme;

            const localPath = resolve(projectDir, "themes", themeConfig.name);
            if (existsSync(localPath)) {
                return this.loadThemeFromPath(localPath, projectDir);
            }
        }

        const discovered = await this.discoverNpmThemes(projectDir);
        if (discovered.length > 0) {
            const first = discovered[0];
            return this.loadThemeFromNpm(first.name, projectDir);
        }

        return null;
    }

    /**
     * 从本地路径加载主题
     * @param path 主题路径
     * @param projectDir 项目目录
     * @returns 加载的主题对象，如果加载失败则返回 null
     */
    private async loadThemeFromPath(
        path: string,
        projectDir: string,
    ): Promise<Theme | null> {
        const themeDir = isAbsolute(path) ? path : resolve(projectDir, path);
        const manifest = await loadThemeManifest(themeDir);
        if (!manifest) return null;

        this.theme = {
            manifest,
            path: themeDir,
            templatesDir: join(themeDir, "templates"),
            staticDir: join(themeDir, "static"),
            shortcodesDir: join(themeDir, "shortcodes"),
        };

        return this.theme;
    }

    /**
     * 获取已发现的 npm 主题
     * @returns npm 主题映射
     */
    getNpmThemes(): Map<string, DiscoveredPackage> {
        return this.npmThemes;
    }

    /**
     * 获取当前主题
     * @returns 当前主题对象，如果未加载则返回 null
     */
    getTheme(): Theme | null {
        return this.theme;
    }

    /**
     * 合并主题配置
     * @param userConfig 用户配置
     * @param themeConfig 主题配置默认值
     * @returns 合并后的配置对象
     */
    mergeThemeConfig(
        userConfig: DokiConfig,
        themeConfig: Record<string, unknown>,
    ): DokiConfig {
        const merged = { ...userConfig };

        for (const [key, value] of Object.entries(themeConfig)) {
            if (!(key in merged)) {
                (merged as Record<string, unknown>)[key] = value;
            } else if (
                typeof value === "object" &&
                value !== null &&
                !Array.isArray(value)
            ) {
                const existingValue = (merged as Record<string, unknown>)[key];
                if (
                    typeof existingValue === "object" &&
                    existingValue !== null &&
                    !Array.isArray(existingValue)
                ) {
                    (merged as Record<string, unknown>)[key] = {
                        ...value,
                        ...existingValue,
                    };
                }
            }
        }

        return merged;
    }

    /**
     * 获取主题模板
     * @returns 模板名称到模板路径的映射
     */
    async getThemeTemplates(): Promise<Map<string, string>> {
        const templates = new Map<string, string>();

        if (!this.theme) {
            return templates;
        }

        const templatesDir = this.theme.templatesDir;

        if (!existsSync(templatesDir)) {
            return templates;
        }

        await readTemplatesRecursively(templatesDir, templatesDir, templates);

        return templates;
    }

    /**
     * 获取主题静态资源目录
     * @returns 静态资源目录路径，如果未加载主题则返回 null
     */
    getThemeStaticDir(): string | null {
        if (!this.theme) {
            return null;
        }

        return this.theme.staticDir;
    }

    /**
     * 获取主题短代码目录
     * @returns 短代码目录路径，如果未加载主题则返回 null
     */
    getThemeShortcodesDir(): string | null {
        if (!this.theme) {
            return null;
        }

        return this.theme.shortcodesDir;
    }

    /**
     * 解析主题模板引用
     * @param templateName 模板名称
     * @returns 模板文件的完整路径，如果未找到则返回 null
     */
    resolveThemeTemplate(templateName: string): string | null {
        if (!this.theme) {
            return null;
        }

        let templatePath = join(this.theme.templatesDir, templateName);

        if (existsSync(templatePath)) {
            return templatePath;
        }

        if (
            !templateName.endsWith(".html") &&
            !templateName.endsWith(".doki")
        ) {
            templatePath = join(
                this.theme.templatesDir,
                `${templateName}.html`,
            );
            if (existsSync(templatePath)) {
                return templatePath;
            }

            templatePath = join(
                this.theme.templatesDir,
                `${templateName}.doki`,
            );
            if (existsSync(templatePath)) {
                return templatePath;
            }
        }

        return null;
    }
}

/**
 * 解析主题配置文件
 * @param content TOML 配置文件内容
 * @returns 主题配置对象
 */
export function parseThemeConfig(content: string): ThemeManifest {
    const parsed = parse(content) as unknown as ThemeManifest;

    if (!parsed.name) {
        throw new Error("Theme config missing required field: name");
    }

    if (!parsed.version) {
        throw new Error("Theme config missing required field: version");
    }

    return parsed;
}

/**
 * 查找可用主题
 * @param themesDir 主题目录
 * @returns 可用主题名称列表
 */
export async function findAvailableThemes(
    themesDir: string,
): Promise<string[]> {
    const themes: string[] = [];

    if (!existsSync(themesDir)) {
        return themes;
    }

    try {
        const entries = await readdir(themesDir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const themePath = join(themesDir, entry.name);
                const manifestPath = join(themePath, "theme.toml");

                if (existsSync(manifestPath)) {
                    themes.push(entry.name);
                }
            }
        }
    } catch (_error) {
        console.warn(`Failed to read themes directory: ${themesDir}`);
    }

    return themes;
}

/** 主题加载器 */
export class ThemeLoader {
    private themePath: string;
    private config: ThemeManifest | null = null;

    /**
     * 创建主题加载器实例
     * @param themeName 主题名称
     * @param themesDir 主题目录
     */
    constructor(themeName: string, themesDir: string) {
        this.themePath = join(themesDir, themeName);
        this.config = null;
    }

    /**
     * 加载主题配置
     * @returns 主题配置对象，如果加载失败则返回 null
     */
    async loadConfig(): Promise<ThemeManifest | null> {
        const manifestPath = join(this.themePath, "theme.toml");

        if (!existsSync(manifestPath)) {
            return null;
        }

        try {
            const content = await readFile(manifestPath, "utf-8");
            this.config = parseThemeConfig(content);
            return this.config;
        } catch (error) {
            console.error(`Failed to load theme config: ${manifestPath}`);
            console.error((error as Error).message);
            return null;
        }
    }

    /**
     * 获取模板目录路径
     * @returns 模板目录路径
     */
    getTemplatesDir(): string {
        return join(this.themePath, "templates");
    }

    /**
     * 获取静态文件目录路径
     * @returns 静态文件目录路径
     */
    getStaticDir(): string {
        return join(this.themePath, "static");
    }

    /**
     * 检查主题是否存在
     * @returns 主题是否存在
     */
    exists(): boolean {
        return existsSync(join(this.themePath, "theme.toml"));
    }

    /**
     * 列出主题中的模板文件
     * @returns 模板文件名列表
     */
    async listTemplates(): Promise<string[]> {
        const templatesDir = this.getTemplatesDir();
        const templates: string[] = [];

        if (!existsSync(templatesDir)) {
            return templates;
        }

        try {
            const entries = await readdir(templatesDir, {
                withFileTypes: true,
            });

            for (const entry of entries) {
                if (
                    entry.isFile() &&
                    (entry.name.endsWith(".html") ||
                        entry.name.endsWith(".doki"))
                ) {
                    templates.push(entry.name);
                }
            }
        } catch (_error) {
            console.warn(`Failed to list templates: ${templatesDir}`);
        }

        return templates;
    }
}
