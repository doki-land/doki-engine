/** Doki Engine 配置系统 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parse } from "smol-toml";

/** 项目类型 */
export type ProjectType = "blog" | "docs" | "wiki" | "portfolio";

/** package.json 中的 doki 配置 */
export interface DokiPackageJsonConfig {
    theme?: string;
    plugins?: string[];
}

/** package.json 结构 */
export interface DokiPackageJson {
    name: string;
    version: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    doki?: DokiPackageJsonConfig;
}

/** 分类法配置 */
export interface TaxonomyConfig {
    /** 是否生成订阅源 */
    feed?: boolean;
    /** 分页数量 */
    paginateBy?: number;
}

/** 区段配置 */
export interface SectionConfig {
    /** 是否生成区段列表页 */
    listPage: boolean;
    /** 区段列表页模板 */
    template?: string;
    /** 区段分页数量 */
    paginateBy?: number;
}

/** 订阅源配置 */
export interface FeedConfig {
    /** 是否启用订阅源 */
    enabled: boolean;
    /** 订阅源条目数量限制 */
    limit: number;
    /** 订阅源格式 */
    format: "atom" | "rss";
}

/** 站点地图配置 */
export interface SitemapConfig {
    /** 是否启用站点地图 */
    enabled: boolean;
}

/** 语言配置 */
export interface LanguageConfig {
    /** 语言特定标题 */
    title: string;
    /** 语言特定描述 */
    description: string;
    /** 语言特定作者 */
    author?: string;
    /** 语言代码（如 en, zh） */
    lang?: string;
    /** 语言特定站点 URL */
    url?: string;
}

/** 短代码配置 */
export interface ShortcodeConfig {
    /** 短代码模板目录 */
    dir: string;
    /** 是否启用内置短代码 */
    builtin: boolean;
}

/** 图片配置 */
export interface ImageConfig {
    /** 是否优化图片 */
    optimize: boolean;
    /** 是否启用懒加载 */
    lazyLoading: boolean;
    /** 是否生成响应式图片 */
    responsive: boolean;
    /** 响应式图片尺寸列表 */
    sizes: number[];
    /** 输出格式列表 */
    formats: string[];
    /** 图片质量 1-100 */
    quality: number;
}

/** 主题配置 */
export interface ThemeConfig {
    /** 主题名称或路径 */
    name?: string;
    /** 主题版本 */
    version?: string;
    /** 主题本地路径（相对或绝对） */
    path?: string;
}

/** 插件配置 */
export interface PluginConfig {
    /** 插件名称 */
    name: string;
    /** 是否启用 */
    enabled?: boolean;
    /** 插件选项 */
    options?: Record<string, unknown>;
}

/** 语法高亮配置 */
export interface HighlightConfig {
    /** 是否启用语法高亮 */
    enabled: boolean;
    /** 高亮主题 */
    theme: string;
    /** 是否显示行号 */
    lineNumbers: boolean;
    /** 是否启用行高亮 */
    lineHighlight: boolean;
}

/** 搜索配置 */
export interface SearchConfig {
    /** 是否启用搜索索引 */
    enabled: boolean;
    /** 索引字段列表 */
    fields: string[];
    /** 分词方式 */
    segmentation?: "jieba" | "none";
    /** 是否输出搜索组件 */
    outputComponent: boolean;
}

/** Sass 配置 */
export interface SassConfig {
    /** 是否启用 Sass 编译 */
    enabled: boolean;
    /** 输出样式 */
    style: "expanded" | "compressed";
    /** 是否生成 Source Map */
    sourceMap: boolean;
    /** 导入路径 */
    includePaths: string[];
}

/** 数学渲染引擎类型 */
export type MathEngine = "katex" | "mathjax";

/** 数学配置 */
export interface MathConfig {
    /** 是否启用数学公式渲染 */
    enabled: boolean;
    /** 渲染引擎：katex 或 mathjax */
    engine: MathEngine;
    /** 行内公式定界符 */
    inlineDelimiters: [string, string];
    /** 块级公式定界符 */
    blockDelimiters: [string, string];
    /** 是否输出 HTML（true）还是保留原始公式（false） */
    outputHtml: boolean;
    /** KaTeX 特定选项 */
    katexOptions?: {
        /** 是否启用严格模式 */
        strict?: boolean;
        /** 是否启用信任模式 */
        trust?: boolean;
        /** 宏定义 */
        macros?: Record<string, string>;
    };
    /** MathJax 特定选项 */
    mathjaxOptions?: {
        /** MathJax 版本 */
        version?: 2 | 3;
        /** 输出格式 */
        output?: "html" | "svg";
    };
}

/** 数据配置 */
export interface DataConfig {
    /** 数据目录 */
    dir: string;
}

/** 重定向配置 */
export interface RedirectConfig {
    /** 是否启用别名重定向 */
    enabled: boolean;
    /** 自定义重定向模板路径 */
    template?: string;
}

/** 永久链接配置 */
export interface PermalinkConfig {
    /** URL 模式，支持占位符如 :year, :month, :day, :slug, :section, :categories, :title */
    pattern: string;
    /** 是否生成尾部斜杠 */
    trailingSlash: boolean;
}

/** 菜单项配置 */
export interface MenuItem {
    /** 菜单项标识 */
    identifier: string;
    /** 显示名称 */
    name: string;
    /** 链接 URL */
    url?: string;
    /** 权重，用于排序 */
    weight?: number;
    /** 父级标识，用于嵌套 */
    parent?: string;
    /** 前置图标 */
    pre?: string;
    /** 后置图标 */
    post?: string;
}

/** 菜单配置 */
export type MenuConfig = Record<string, MenuItem[]>;

/** 站点配置 */
export interface SiteConfig {
    /** 站点标题 */
    title: string;
    /** 站点描述 */
    description: string;
    /** 站点语言 */
    lang: string;
    /** 站点作者 */
    author: string;
    /** 站点 URL */
    url?: string;
    /** 项目类型 */
    type?: ProjectType;
    /** 默认语言 */
    defaultLanguage?: string;
    /** 支持的语言列表 */
    languages?: string[];
}

/** 构建配置 */
export interface BuildConfig {
    /** 输入目录 */
    inputDir: string;
    /** 输出目录 */
    outputDir: string;
    /** 静态资源目录 */
    staticDir: string;
    /** 数据文件目录 */
    dataDir: string;
    /** 是否启用增量构建 */
    incremental: boolean;
}

/** 模板配置 */
export interface TemplateConfig {
    /** 模板引擎类型 */
    engine: "dejavu" | "doki";
    /** 模板目录 */
    dir: string;
    /** 布局目录 */
    layout: string;
    /** 主题名称 */
    theme?: string;
}

/** Doki 配置文件结构 */
export interface DokiConfig {
    /** 站点配置 */
    site: SiteConfig;
    /** 构建配置 */
    build: BuildConfig;
    /** 模板配置 */
    template: TemplateConfig;
    /** 分类法配置映射 */
    taxonomies?: Record<string, TaxonomyConfig>;
    /** 订阅源配置 */
    feed?: FeedConfig;
    /** 站点地图配置 */
    sitemap?: SitemapConfig;
    /** 短代码配置 */
    shortcodes?: ShortcodeConfig;
    /** 图片配置 */
    image?: ImageConfig;
    /** 语言特定配置映射 */
    languageConfigs?: Record<string, LanguageConfig>;
    /** 主题配置 */
    theme?: ThemeConfig;
    /** 插件配置列表 */
    plugins?: PluginConfig[];
    /** 语法高亮配置 */
    highlight?: HighlightConfig;
    /** 搜索配置 */
    search?: SearchConfig;
    /** Sass 配置 */
    sass?: SassConfig;
    /** 数学公式配置 */
    math?: MathConfig;
    /** 数据配置 */
    data?: DataConfig;
    /** 重定向配置 */
    redirects?: RedirectConfig;
    /** 永久链接配置 */
    permalink?: PermalinkConfig;
    /** 菜单配置 */
    menus?: MenuConfig;
    /** 区段配置 */
    sections?: Record<string, SectionConfig>;
}

/** 默认配置 */
export const DEFAULT_CONFIG: DokiConfig = {
    site: {
        title: "My Doki Site",
        description: "A static site generated by Doki Engine",
        lang: "zh-CN",
        author: "Author",
        defaultLanguage: "en",
        languages: ["en"],
    },
    build: {
        inputDir: "content",
        outputDir: "dist",
        staticDir: "static",
        dataDir: "data",
        incremental: true,
    },
    template: {
        engine: "doki",
        dir: "templates",
        layout: "layout",
        theme: undefined,
    },
    taxonomies: {},
    sections: {},
    feed: {
        enabled: false,
        limit: 20,
        format: "atom",
    },
    sitemap: {
        enabled: false,
    },
    shortcodes: {
        dir: "shortcodes",
        builtin: true,
    },
    image: {
        optimize: true,
        lazyLoading: true,
        responsive: true,
        sizes: [320, 640, 960, 1280],
        formats: ["webp", "original"],
        quality: 85,
    },
    theme: {},
    plugins: [],
    highlight: {
        enabled: true,
        theme: "github-dark",
        lineNumbers: false,
        lineHighlight: true,
    },
    search: {
        enabled: false,
        fields: ["title", "content"],
        segmentation: "none",
        outputComponent: false,
    },
    sass: {
        enabled: true,
        style: "expanded",
        sourceMap: false,
        includePaths: [],
    },
    math: {
        enabled: true,
        engine: "katex",
        inlineDelimiters: ["$", "$"],
        blockDelimiters: ["$$", "$$"],
        outputHtml: true,
    },
    data: {
        dir: "data",
    },
    redirects: {
        enabled: true,
    },
};

/**
 * 根据项目类型获取默认分类法配置
 * @param projectType 项目类型
 * @returns 默认分类法配置映射
 */
export function getDefaultTaxonomies(
    projectType: ProjectType,
): Record<string, TaxonomyConfig> {
    switch (projectType) {
        case "blog":
            return {
                tags: {},
                categories: {},
                series: {},
                authors: {},
            };
        case "docs":
            return {
                sections: {},
                versions: {},
                languages: {},
            };
        default:
            return {};
    }
}

/** 将 snake_case 转换为 camelCase */
function toCamelCase(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) =>
            letter.toUpperCase(),
        );
        if (
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
        ) {
            result[camelKey] = toCamelCase(value as Record<string, unknown>);
        } else {
            result[camelKey] = value;
        }
    }
    return result;
}

/** 主题简写名称映射 */
const THEME_SHORTHANDS: Record<string, string> = {
    blog: "@doki-land/theme-blog",
    docs: "@doki-land/theme-docs",
    wiki: "@doki-land/theme-wiki",
    portfolio: "@doki-land/theme-portfolio",
    default: "@doki-land/theme-default",
};

/** 插件简写名称映射 */
const PLUGIN_SHORTHANDS: Record<string, string> = {
    search: "@doki-land/plugin-search",
    sitemap: "@doki-land/plugin-sitemap",
    feed: "@doki-land/plugin-feed",
    analytics: "@doki-land/plugin-analytics",
    comments: "@doki-land/plugin-comments",
    seo: "@doki-land/plugin-seo",
};

/**
 * 解析主题简写名称为完整包名
 * @param name 主题名称或简写
 * @returns 完整的 npm 包名
 */
export function resolveThemeName(name: string): string {
    if (THEME_SHORTHANDS[name]) {
        return THEME_SHORTHANDS[name];
    }
    if (
        name.startsWith("@") ||
        name.startsWith("./") ||
        name.startsWith("../")
    ) {
        return name;
    }
    return `@doki-land/theme-${name}`;
}

/**
 * 解析插件简写名称为完整包名
 * @param name 插件名称或简写
 * @returns 完整的 npm 包名
 */
export function resolvePluginName(name: string): string {
    if (PLUGIN_SHORTHANDS[name]) {
        return PLUGIN_SHORTHANDS[name];
    }
    if (
        name.startsWith("@") ||
        name.startsWith("./") ||
        name.startsWith("../")
    ) {
        return name;
    }
    return `@doki-land/plugin-${name}`;
}

/**
 * 从 package.json 加载 Doki 配置
 * @param projectDir 项目目录
 * @returns Doki 配置，如果不存在则返回 null
 */
export async function loadPackageJsonConfig(
    projectDir: string,
): Promise<DokiPackageJsonConfig | null> {
    const packageJsonPath = resolve(projectDir, "package.json");

    if (!existsSync(packageJsonPath)) {
        return null;
    }

    try {
        const content = await readFile(packageJsonPath, "utf-8");
        const packageJson = JSON.parse(content) as DokiPackageJson;

        if (!packageJson.doki) {
            return null;
        }

        const config: DokiPackageJsonConfig = {};

        if (packageJson.doki.theme) {
            config.theme = resolveThemeName(packageJson.doki.theme);
        }

        if (packageJson.doki.plugins && packageJson.doki.plugins.length > 0) {
            config.plugins = packageJson.doki.plugins.map(resolvePluginName);
        }

        return config;
    } catch (error) {
        console.warn(`Failed to parse package.json: ${packageJsonPath}`);
        console.warn((error as Error).message);
        return null;
    }
}

/**
 * 加载配置文件
 * @param configPath 配置文件路径
 * @returns 合并后的配置对象
 */
export async function loadConfig(
    configPath: string = "doki.toml",
): Promise<DokiConfig> {
    const absolutePath = resolve(configPath);
    const projectDir = dirname(absolutePath);

    let tomlConfig: Record<string, unknown> | null = null;
    let packageJsonConfig: DokiPackageJsonConfig | null = null;

    if (existsSync(absolutePath)) {
        try {
            const content = await readFile(absolutePath, "utf-8");
            const parsed = parse(content) as Record<string, unknown>;
            tomlConfig = toCamelCase(parsed);
        } catch (error) {
            console.error(`Failed to parse config file: ${absolutePath}`);
            console.error((error as Error).message);
        }
    }

    packageJsonConfig = await loadPackageJsonConfig(projectDir);

    if (!tomlConfig && !packageJsonConfig) {
        console.warn(`Config file not found: ${absolutePath}, using defaults`);
        return { ...DEFAULT_CONFIG };
    }

    const mergedConfig = mergeConfigWithPriority(
        DEFAULT_CONFIG,
        packageJsonConfig,
        tomlConfig,
    );

    return mergedConfig;
}

/**
 * 按优先级合并配置
 * @param defaults 默认配置
 * @param packageJsonConfig package.json 配置
 * @param tomlConfig doki.toml 配置
 * @returns 合并后的配置对象
 */
function mergeConfigWithPriority(
    defaults: DokiConfig,
    packageJsonConfig: DokiPackageJsonConfig | null,
    tomlConfig: Record<string, unknown> | null,
): DokiConfig {
    let config = { ...defaults };

    if (packageJsonConfig) {
        if (packageJsonConfig.theme) {
            config.theme = {
                ...config.theme,
                name: packageJsonConfig.theme,
            };
        }

        if (packageJsonConfig.plugins && packageJsonConfig.plugins.length > 0) {
            config.plugins = packageJsonConfig.plugins.map((name) => ({
                name,
                enabled: true,
            }));
        }
    }

    if (tomlConfig) {
        config = mergeConfig(config, tomlConfig);
    }

    if (config.theme?.name) {
        config.theme.name = resolveThemeName(config.theme.name);
    }

    if (config.plugins && config.plugins.length > 0) {
        config.plugins = config.plugins.map((plugin) => ({
            ...plugin,
            name: resolvePluginName(plugin.name),
        }));
    }

    return config;
}

/**
 * 合并配置
 * @param defaults 默认配置
 * @param overrides 覆盖配置
 * @returns 合并后的配置对象
 */
function mergeConfig(
    defaults: DokiConfig,
    overrides: Record<string, unknown>,
): DokiConfig {
    const mergedTaxonomies = overrides.taxonomies
        ? {
              ...defaults.taxonomies,
              ...(overrides.taxonomies as Record<string, TaxonomyConfig>),
          }
        : defaults.taxonomies;

    const mergedSections = overrides.sections
        ? {
              ...(overrides.sections as Record<string, SectionConfig>),
          }
        : defaults.sections;

    const mergedLanguageConfigs = overrides.languageConfigs
        ? { ...(overrides.languageConfigs as Record<string, LanguageConfig>) }
        : defaults.languageConfigs;

    return {
        site: {
            ...defaults.site,
            ...((overrides.site as Partial<SiteConfig>) || {}),
        },
        build: {
            ...defaults.build,
            ...((overrides.build as Partial<BuildConfig>) || {}),
        },
        template: {
            ...defaults.template,
            ...((overrides.template as Partial<TemplateConfig>) || {}),
        },
        taxonomies: mergedTaxonomies,
        sections: mergedSections,
        feed: overrides.feed
            ? { ...defaults.feed, ...(overrides.feed as FeedConfig) }
            : defaults.feed,
        sitemap: overrides.sitemap
            ? { ...defaults.sitemap, ...(overrides.sitemap as SitemapConfig) }
            : defaults.sitemap,
        shortcodes: overrides.shortcodes
            ? {
                  ...defaults.shortcodes,
                  ...(overrides.shortcodes as ShortcodeConfig),
              }
            : defaults.shortcodes,
        image: overrides.image
            ? { ...defaults.image, ...(overrides.image as ImageConfig) }
            : defaults.image,
        languageConfigs: mergedLanguageConfigs,
        theme: overrides.theme
            ? { ...defaults.theme, ...(overrides.theme as ThemeConfig) }
            : defaults.theme,
        plugins: overrides.plugins
            ? (overrides.plugins as PluginConfig[])
            : defaults.plugins,
        highlight: overrides.highlight
            ? {
                  ...defaults.highlight,
                  ...(overrides.highlight as HighlightConfig),
              }
            : defaults.highlight,
        search: overrides.search
            ? { ...defaults.search, ...(overrides.search as SearchConfig) }
            : defaults.search,
        sass: overrides.sass
            ? { ...defaults.sass, ...(overrides.sass as SassConfig) }
            : defaults.sass,
        math: overrides.math
            ? { ...defaults.math, ...(overrides.math as MathConfig) }
            : defaults.math,
        data: overrides.data
            ? { ...defaults.data, ...(overrides.data as DataConfig) }
            : defaults.data,
        redirects: overrides.redirects
            ? {
                  ...defaults.redirects,
                  ...(overrides.redirects as RedirectConfig),
              }
            : defaults.redirects,
    };
}

/**
 * 获取站点变量（用于模板上下文）
 * @param config Doki 配置对象
 * @returns 站点变量映射
 */
export function getSiteVariables(config: DokiConfig): Record<string, unknown> {
    return {
        title: config.site.title,
        description: config.site.description,
        lang: config.site.lang,
        author: config.site.author,
        url: config.site.url || "",
        type: config.site.type || null,
        defaultLanguage: config.site.defaultLanguage || "en",
        languages: config.site.languages || ["en"],
    };
}

/**
 * 获取菜单变量（用于模板上下文）
 * @param config Doki 配置对象
 * @returns 菜单配置对象
 */
export function getMenuVariables(config: DokiConfig): MenuConfig | undefined {
    return config.menus;
}

/**
 * 获取指定语言的配置
 * @param config Doki 配置对象
 * @param lang 语言代码
 * @returns 语言配置对象，如果不存在则返回 undefined
 */
export function getLanguageConfig(
    config: DokiConfig,
    lang: string,
): LanguageConfig | undefined {
    if (!config.languageConfigs) {
        return undefined;
    }
    return config.languageConfigs[lang];
}
