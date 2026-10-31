/**
 * Doki Engine 本地化模块
 *
 * 提供多语言内容管理、翻译字符串加载和语言切换功能。
 *
 * 术语说明：
 * - i18n (internationalization): 国际化，让软件能支持多语言
 * - l10n (localization): 本地化，翻译成特定语言
 * - locales: 存放翻译文件的目录
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { DokiConfig, LanguageConfig } from "./config.js";

/**
 * 翻译条目
 *
 * 表示单个翻译键值对。
 */
export interface TranslationEntry {
    /** 翻译键 */
    key: string;
    /** 翻译值 */
    value: string;
    /** 翻译上下文（可选） */
    context?: string;
}

/**
 * 翻译集合
 *
 * 包含特定语言的所有翻译条目。
 */
export interface Translation {
    /** 语言代码 */
    lang: string;
    /** 翻译条目映射 */
    entries: Map<string, string>;
}

/**
 * 多语言内容信息
 *
 * 表示内容文件的语言信息。
 */
export interface LocalizedContent {
    /** 内容基础名称（不含语言后缀） */
    baseName: string;
    /** 语言代码 */
    lang: string;
    /** 原始文件名 */
    originalName: string;
    /** 是否为默认语言 */
    isDefault: boolean;
}

/**
 * 语言切换链接
 *
 * 表示切换到其他语言的链接信息。
 */
export interface LanguageSwitcherLink {
    /** 语言代码 */
    lang: string;
    /** 语言名称 */
    langName: string;
    /** 对应语言的 URL */
    url: string;
    /** 是否为当前语言 */
    isCurrent: boolean;
}

/**
 * 翻译管理器
 *
 * 管理多语言翻译字符串的加载和查询。
 */
export class TranslationManager {
    /** 翻译集合映射（语言代码 -> 翻译集合） */
    private translations: Map<string, Translation>;
    /** 默认语言 */
    private defaultLang: string;

    /**
     * 创建翻译管理器实例
     *
     * @param defaultLang 默认语言代码
     */
    constructor(defaultLang: string = "en") {
        this.translations = new Map();
        this.defaultLang = defaultLang;
    }

    /**
     * 加载翻译文件
     *
     * 从指定目录加载所有语言的翻译文件。
     *
     * @param i18nDir 国际化目录路径
     * @param languages 语言代码列表
     */
    async loadTranslations(
        i18nDir: string,
        languages: string[],
    ): Promise<void> {
        for (const lang of languages) {
            const filePath = resolve(i18nDir, `${lang}.toml`);
            await this.loadTranslationFile(lang, filePath);
        }
    }

    /**
     * 加载单个翻译文件
     *
     * @param lang 语言代码
     * @param filePath 翻译文件路径
     */
    async loadTranslationFile(lang: string, filePath: string): Promise<void> {
        if (!existsSync(filePath)) {
            console.warn(`Translation file not found: ${filePath}`);
            return;
        }

        try {
            const content = await readFile(filePath, "utf-8");
            const parsed = parseToml(content) as Record<string, unknown>;
            const entries = this.flattenTranslations(parsed);

            const translation: Translation = {
                lang,
                entries,
            };

            this.translations.set(lang, translation);
        } catch (error) {
            console.error(`Failed to load translation file: ${filePath}`);
            console.error((error as Error).message);
        }
    }

    /**
     * 扁平化翻译对象
     *
     * 将嵌套的翻译对象转换为扁平的键值对映射。
     *
     * @param obj 翻译对象
     * @param prefix 键前缀
     * @returns 扁平化的翻译映射
     */
    private flattenTranslations(
        obj: Record<string, unknown>,
        prefix: string = "",
    ): Map<string, string> {
        const result = new Map<string, string>();

        for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;

            if (typeof value === "string") {
                result.set(fullKey, value);
            } else if (typeof value === "object" && value !== null) {
                const nested = this.flattenTranslations(
                    value as Record<string, unknown>,
                    fullKey,
                );
                for (const [k, v] of nested) {
                    result.set(k, v);
                }
            }
        }

        return result;
    }

    /**
     * 获取翻译字符串
     *
     * @param key 翻译键
     * @param lang 语言代码（可选，默认使用默认语言）
     * @param params 插值参数（可选）
     * @returns 翻译后的字符串，找不到则返回键名
     */
    t(key: string, lang?: string, params?: Record<string, unknown>): string {
        const targetLang = lang || this.defaultLang;
        const translation = this.translations.get(targetLang);

        if (!translation) {
            return key;
        }

        let value = translation.entries.get(key);

        if (!value) {
            // 尝试回退到默认语言
            if (targetLang !== this.defaultLang) {
                const defaultTranslation = this.translations.get(
                    this.defaultLang,
                );
                if (defaultTranslation) {
                    value = defaultTranslation.entries.get(key);
                }
            }

            if (!value) {
                return key;
            }
        }

        // 处理插值
        if (params) {
            return this.interpolate(value, params);
        }

        return value;
    }

    /**
     * 插值处理
     *
     * 替换翻译字符串中的变量占位符。
     *
     * @param template 模板字符串
     * @param params 参数映射
     * @returns 插值后的字符串
     */
    private interpolate(
        template: string,
        params: Record<string, unknown>,
    ): string {
        return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
            if (Object.hasOwn(params, key)) {
                return String(params[key]);
            }
            return match;
        });
    }

    /**
     * 获取所有已加载的语言
     *
     * @returns 语言代码数组
     */
    getLoadedLanguages(): string[] {
        return Array.from(this.translations.keys());
    }

    /**
     * 检查语言是否已加载
     *
     * @param lang 语言代码
     * @returns 是否已加载
     */
    hasLanguage(lang: string): boolean {
        return this.translations.has(lang);
    }
}

/**
 * 语言解析器
 *
 * 解析内容文件的语言信息并建立翻译关联。
 */
export class LanguageResolver {
    /** 默认语言 */
    private defaultLang: string;
    /** 支持的语言列表 */
    private languages: string[];

    /**
     * 创建语言解析器实例
     *
     * @param defaultLang 默认语言代码
     * @param languages 支持的语言列表
     */
    constructor(defaultLang: string = "en", languages: string[] = ["en"]) {
        this.defaultLang = defaultLang;
        this.languages = languages;
    }

    /**
     * 解析文件名的语言信息
     *
     * 从文件名中提取语言后缀，如 `hello.zh.md` 解析为 `{ baseName: 'hello', lang: 'zh' }`。
     *
     * @param filename 文件名
     * @returns 多语言内容信息
     */
    parseFilename(filename: string): LocalizedContent {
        const ext = extname(filename);
        const nameWithoutExt = basename(filename, ext);

        // 检查是否有语言后缀（如 .zh, .en）
        const langMatch = nameWithoutExt.match(/\.([a-z]{2,3})$/i);

        if (langMatch) {
            const lang = langMatch[1].toLowerCase();
            const baseName = nameWithoutExt.slice(0, -langMatch[0].length + 1);

            return {
                baseName,
                lang,
                originalName: filename,
                isDefault: lang === this.defaultLang,
            };
        }

        // 没有语言后缀，视为默认语言
        return {
            baseName: nameWithoutExt,
            lang: this.defaultLang,
            originalName: filename,
            isDefault: true,
        };
    }

    /**
     * 生成语言特定的 URL
     *
     * @param path 内容路径
     * @param lang 语言代码
     * @returns 语言特定的 URL
     */
    generateLocalizedUrl(path: string, lang: string): string {
        // 默认语言不需要前缀
        if (lang === this.defaultLang) {
            return path;
        }

        // 其他语言添加语言前缀
        if (path.startsWith("/")) {
            return `/${lang}${path}`;
        }

        return `/${lang}/${path}`;
    }

    /**
     * 从 URL 中提取语言代码
     *
     * @param url URL 路径
     * @returns 语言代码和去除语言前缀后的路径
     */
    parseUrl(url: string): { lang: string; path: string } {
        const match = url.match(/^\/([a-z]{2,3})(\/.*)?$/i);

        if (match && this.languages.includes(match[1].toLowerCase())) {
            return {
                lang: match[1].toLowerCase(),
                path: match[2] || "/",
            };
        }

        return {
            lang: this.defaultLang,
            path: url,
        };
    }

    /**
     * 构建内容翻译关联
     *
     * 将同一内容的不同语言版本关联起来。
     *
     * @param contents 内容文件列表
     * @returns 翻译关联映射（基础名称 -> 语言 -> 文件路径）
     */
    buildTranslationMap(
        contents: Array<{ path: string; relativePath: string }>,
    ): Map<string, Map<string, string>> {
        const translationMap = new Map<string, Map<string, string>>();

        for (const content of contents) {
            const localized = this.parseFilename(
                basename(content.relativePath),
            );
            const key = `${dirname(content.relativePath)}/${localized.baseName}`;

            if (!translationMap.has(key)) {
                translationMap.set(key, new Map());
            }

            translationMap.get(key)?.set(localized.lang, content.path);
        }

        return translationMap;
    }

    /**
     * 生成语言切换器链接
     *
     * @param currentLang 当前语言
     * @param currentPath 当前路径
     * @param availableLangs 可用语言列表
     * @param languageConfigs 语言配置映射
     * @returns 语言切换链接数组
     */
    generateLanguageSwitcher(
        currentLang: string,
        currentPath: string,
        availableLangs: string[],
        languageConfigs?: Record<string, LanguageConfig>,
    ): LanguageSwitcherLink[] {
        const links: LanguageSwitcherLink[] = [];

        for (const lang of availableLangs) {
            const langConfig = languageConfigs?.[lang];
            const url = this.generateLocalizedUrl(currentPath, lang);

            links.push({
                lang,
                langName: langConfig?.title || lang,
                url,
                isCurrent: lang === currentLang,
            });
        }

        return links;
    }
}

/**
 * 创建默认翻译管理器
 *
 * @param defaultLang 默认语言
 * @returns 翻译管理器实例
 */
export function createTranslationManager(
    defaultLang: string = "en",
): TranslationManager {
    return new TranslationManager(defaultLang);
}

/**
 * 创建默认语言解析器
 *
 * @param config Doki 配置
 * @returns 语言解析器实例
 */
export function createLanguageResolver(config: DokiConfig): LanguageResolver {
    return new LanguageResolver(
        config.site.defaultLanguage || "en",
        config.site.languages || ["en"],
    );
}

/**
 * 从配置创建本地化上下文
 *
 * @param config Doki 配置
 * @param currentLang 当前语言
 * @param currentPath 当前路径
 * @returns 本地化上下文对象
 */
export function createLocalesContext(
    config: DokiConfig,
    currentLang: string,
    currentPath: string,
): {
    lang: string;
    languages: string[];
    defaultLanguage: string;
    languageSwitcher: LanguageSwitcherLink[];
} {
    const resolver = createLanguageResolver(config);
    const languages = config.site.languages || ["en"];
    const defaultLanguage = config.site.defaultLanguage || "en";

    return {
        lang: currentLang,
        languages,
        defaultLanguage,
        languageSwitcher: resolver.generateLanguageSwitcher(
            currentLang,
            currentPath,
            languages,
            config.languageConfigs,
        ),
    };
}
