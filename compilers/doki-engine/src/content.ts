/** Doki Engine 内容收集模块 */

import { readdir, readFile } from "fs/promises";
import { existsSync, mkdirSync, copyFileSync } from "fs";
import { join, relative, dirname, basename } from "path";
import {
    parseMarkdown,
    getPageVariables,
    Frontmatter,
    MarkdownParseOptions,
} from "./markdown.js";
import { LanguageResolver, LocalizedContent } from "./locales.js";
import {
    generatePermalink,
} from "./permalink.js";
import type { PermalinkConfig } from "./config.js";

/** 页面包类型 */
export type BundleType = "leaf" | "branch" | "none";

/** 页面包 */
export interface PageBundle {
    /** 包类型 */
    type: BundleType;
    /** 包路径 */
    path: string;
    /** 内容项 */
    content: Content | null;
    /** 资源文件列表 */
    resources: string[];
    /** 子包 */
    children: PageBundle[];
}

/** 内容项 */
export interface Content {
    /** 源文件路径 */
    sourcePath: string;
    /** 相对路径（相对于内容目录） */
    relativePath: string;
    /** 输出 URL 路径 */
    url: string;
    /** Frontmatter 元数据 */
    frontmatter: Frontmatter;
    /** 原始 Markdown 内容 */
    rawContent: string;
    /** 渲染后的 HTML */
    html: string;
    /** 页面变量（用于模板） */
    variables: Record<string, unknown>;
    /** 语言代码 */
    lang: string;
    /** 内容基础名称（不含语言后缀） */
    baseName: string;
    /** 是否为默认语言 */
    isDefaultLang: boolean;
    /** 翻译关联（其他语言版本的路径） */
    translations?: Map<string, string>;
}

/** 内容集合 */
export interface ContentCollection {
    /** 所有内容项 */
    items: Content[];
    /** 内容数量 */
    count: number;
}

/** 内容区段 */
export interface Section {
    /** 区段名称 */
    name: string;
    /** 区段路径 */
    path: string;
    /** 区段内的页面列表 */
    pages: Content[];
    /** 子区段列表 */
    children: Section[];
}

/** 内容收集选项 */
export interface CollectOptions {
    /** 内容目录 */
    inputDir: string;
    /** 是否包含草稿 */
    includeDrafts?: boolean;
    /** 默认语言 */
    defaultLanguage?: string;
    /** 支持的语言列表 */
    languages?: string[];
    /** Markdown 解析选项 */
    parseOptions?: MarkdownParseOptions;
    /** 永久链接配置 */
    permalinkConfig?: PermalinkConfig;
}

/** 收集内容文件 */
export async function collectContent(
    options: CollectOptions,
): Promise<ContentCollection> {
    const {
        inputDir,
        includeDrafts = false,
        defaultLanguage = "en",
        languages = ["en"],
        parseOptions,
        permalinkConfig,
    } = options;
    const items: Content[] = [];
    const resolver = new LanguageResolver(defaultLanguage, languages);

    await scanDirectory(
        inputDir,
        inputDir,
        items,
        includeDrafts,
        resolver,
        parseOptions,
        permalinkConfig,
    );

    buildTranslationLinks(items, resolver);

    return {
        items,
        count: items.length,
    };
}

/**
 * 构建内容翻译关联
 *
 * @param items 内容项列表
 * @param resolver 语言解析器
 */
function buildTranslationLinks(
    items: Content[],
    _resolver: LanguageResolver,
): void {
    const translationMap = new Map<string, Map<string, Content>>();

    // 按基础名称分组
    for (const item of items) {
        const key = dirname(item.relativePath) + "/" + item.baseName;
        if (!translationMap.has(key)) {
            translationMap.set(key, new Map());
        }
        translationMap.get(key)!.set(item.lang, item);
    }

    // 为每个内容项设置翻译链接
    for (const item of items) {
        const key = dirname(item.relativePath) + "/" + item.baseName;
        const translations = translationMap.get(key);
        if (translations && translations.size > 1) {
            item.translations = new Map();
            for (const [lang, content] of translations) {
                if (lang !== item.lang) {
                    item.translations.set(lang, content.url);
                }
            }
        }
    }
}

/** 递归扫描目录 */
async function scanDirectory(
    currentDir: string,
    baseDir: string,
    items: Content[],
    includeDrafts: boolean,
    resolver: LanguageResolver,
    parseOptions?: MarkdownParseOptions,
    permalinkConfig?: PermalinkConfig,
): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);

        if (entry.isDirectory()) {
            await scanDirectory(
                fullPath,
                baseDir,
                items,
                includeDrafts,
                resolver,
                parseOptions,
                permalinkConfig,
            );
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
            const content = await processContent(
                fullPath,
                baseDir,
                resolver,
                parseOptions,
                permalinkConfig,
            );

            if (content && (includeDrafts || !content.frontmatter.draft)) {
                items.push(content);
            }
        }
    }
}

/** 处理单个内容文件 */
export async function processContent(
    filePath: string,
    baseDir: string,
    resolver?: LanguageResolver,
    parseOptions?: MarkdownParseOptions,
    permalinkConfig?: PermalinkConfig,
): Promise<Content | null> {
    try {
        const source = await readFile(filePath, "utf-8");
        const result = await parseMarkdown(source, parseOptions);
        const relativePath = relative(baseDir, filePath);

        const localized = resolver
            ? resolver.parseFilename(basename(relativePath))
            : {
                  baseName: basename(relativePath, ".md"),
                  lang: "en",
                  isDefault: true,
                  originalName: basename(relativePath),
              };

        let url: string;
        const baseUrl = generateUrl(relativePath, localized);

        if (permalinkConfig) {
            const tempContent: Content = {
                sourcePath: filePath,
                relativePath,
                url: baseUrl,
                frontmatter: result.frontmatter,
                rawContent: result.content,
                html: result.html,
                variables: {},
                lang: localized.lang,
                baseName: localized.baseName,
                isDefaultLang: localized.isDefault,
            };

            url = generatePermalink(permalinkConfig, tempContent);

            if (resolver && !localized.isDefault) {
                url = resolver.generateLocalizedUrl(url, localized.lang);
            }
        } else {
            url = resolver
                ? resolver.generateLocalizedUrl(baseUrl, localized.lang)
                : baseUrl;
        }

        const variables = getPageVariables(
            result.frontmatter,
            result.html,
            url,
        );

        return {
            sourcePath: filePath,
            relativePath,
            url,
            frontmatter: result.frontmatter,
            rawContent: result.content,
            html: result.html,
            variables,
            lang: localized.lang,
            baseName: localized.baseName,
            isDefaultLang: localized.isDefault,
        };
    } catch (error) {
        console.error(`Failed to process content: ${filePath}`);
        console.error((error as Error).message);
        return null;
    }
}

/** 生成 URL 路径 */
function generateUrl(
    relativePath: string,
    localized?: LocalizedContent,
): string {
    const dir = dirname(relativePath);
    const name = localized ? localized.baseName : basename(relativePath, ".md");

    // 如果文件名包含语言后缀，从 URL 中移除
    if (name === "index") {
        return dir === "." ? "/" : `/${dir}/`;
    }

    return dir === "." ? `/${name}/` : `/${dir}/${name}/`;
}

/** 生成输出文件路径 */
export function generateOutputPath(url: string): string {
    if (url.endsWith("/")) {
        return `${url}index.html`;
    }
    return `${url}.html`;
}

/** 按日期排序内容（最新的在前） */
export function sortByDate(items: Content[]): Content[] {
    return [...items].sort((a, b) => {
        const dateA = a.frontmatter.date
            ? new Date(a.frontmatter.date).getTime()
            : 0;
        const dateB = b.frontmatter.date
            ? new Date(b.frontmatter.date).getTime()
            : 0;
        return dateB - dateA;
    });
}

/** 过滤内容 */
export function filterContent(
    items: Content[],
    predicate: (item: Content) => boolean,
): Content[] {
    return items.filter(predicate);
}

/** 获取所有内容变量（用于模板上下文） */
export function getAllContentVariables(
    items: Content[],
): Record<string, unknown>[] {
    return items.map((item) => item.variables);
}

/** 确保目录存在 */
export function ensureDir(dir: string): void {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

/**
 * 检测内容区段
 * 根据内容目录结构自动检测嵌套区段
 * @param contentDir 内容目录路径
 * @param contents 所有内容项列表
 * @returns 检测到的区段列表
 */
export function detectSections(
    _contentDir: string,
    contents: Content[],
): Section[] {
    const sectionMap = new Map<string, Section>();
    const rootSections: Section[] = [];

    const dirSet = new Set<string>();
    for (const content of contents) {
        const relativeDir = dirname(content.relativePath);
        if (relativeDir && relativeDir !== ".") {
            const parts = relativeDir.split(/[/\\]/);
            let currentPath = "";
            for (const part of parts) {
                currentPath = currentPath ? join(currentPath, part) : part;
                dirSet.add(currentPath);
            }
        }
    }

    for (const dirPath of dirSet) {
        const parts = dirPath.split(/[/\\]/);
        const name = parts[parts.length - 1];
        const section: Section = {
            name,
            path: dirPath,
            pages: [],
            children: [],
        };
        sectionMap.set(dirPath, section);
    }

    for (const content of contents) {
        const relativeDir = dirname(content.relativePath);
        if (relativeDir && relativeDir !== ".") {
            const section = sectionMap.get(relativeDir);
            if (section) {
                section.pages.push(content);
            }
        }
    }

    for (const [dirPath, section] of sectionMap) {
        const parts = dirPath.split(/[/\\]/);
        if (parts.length === 1) {
            rootSections.push(section);
        } else {
            const parentPath = parts.slice(0, -1).join("/");
            const parentSection = sectionMap.get(parentPath);
            if (parentSection) {
                parentSection.children.push(section);
            }
        }
    }

    sortSections(rootSections);

    return rootSections;
}

/**
 * 递归排序区段
 * 按名称字母顺序排序区段及其子区段
 * @param sections 区段列表
 */
function sortSections(sections: Section[]): void {
    sections.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    for (const section of sections) {
        if (section.children.length > 0) {
            sortSections(section.children);
        }
    }
}

/**
 * 获取区段 URL
 * 根据区段路径生成对应的 URL
 * @param sectionPath 区段路径
 * @returns 区段 URL
 */
export function getSectionUrl(sectionPath: string): string {
    return `/${sectionPath}/`;
}

/**
 * 按区段分组内容
 * 将内容按所属区段进行分组
 * @param contents 内容列表
 * @returns 区段路径到内容列表的映射
 */
export function groupContentBySection(
    contents: Content[],
): Map<string, Content[]> {
    const groups = new Map<string, Content[]>();

    for (const content of contents) {
        const relativeDir = dirname(content.relativePath);
        const sectionPath =
            relativeDir && relativeDir !== "." ? relativeDir : "";

        if (!groups.has(sectionPath)) {
            groups.set(sectionPath, []);
        }
        groups.get(sectionPath)!.push(content);
    }

    return groups;
}

/** 复制目录 */
export async function copyDir(src: string, dest: string): Promise<void> {
    const entries = await readdir(src, { withFileTypes: true });
    ensureDir(dest);

    for (const entry of entries) {
        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else {
            copyFileSync(srcPath, destPath);
        }
    }
}

/** 页面包检测选项 */
export interface DetectPageBundlesOptions {
    /** 内容目录 */
    contentDir: string;
    /** 是否包含草稿 */
    includeDrafts?: boolean;
    /** 默认语言 */
    defaultLanguage?: string;
    /** 支持的语言列表 */
    languages?: string[];
    /** Markdown 解析选项 */
    parseOptions?: MarkdownParseOptions;
}

/**
 * 检测页面包
 * 扫描内容目录并识别页面包结构
 * @param options 检测选项
 * @returns 页面包数组
 */
export async function detectPageBundles(
    options: DetectPageBundlesOptions,
): Promise<PageBundle[]> {
    const {
        contentDir,
        includeDrafts = false,
        defaultLanguage = "en",
        languages = ["en"],
        parseOptions,
    } = options;

    const resolver = new LanguageResolver(defaultLanguage, languages);
    const bundles: PageBundle[] = [];

    await scanForBundles(
        contentDir,
        contentDir,
        bundles,
        includeDrafts,
        resolver,
        parseOptions,
    );

    return bundles;
}

/**
 * 扫描目录以检测页面包
 * @param currentDir 当前目录
 * @param baseDir 基础目录
 * @param bundles 包集合
 * @param includeDrafts 是否包含草稿
 * @param resolver 语言解析器
 * @param parseOptions 解析选项
 */
async function scanForBundles(
    currentDir: string,
    baseDir: string,
    bundles: PageBundle[],
    includeDrafts: boolean,
    resolver: LanguageResolver,
    parseOptions?: MarkdownParseOptions,
): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });

    const files = entries.filter((e) => e.isFile());
    const directories = entries.filter((e) => e.isDirectory());

    const indexFile = files.find(
        (f) =>
            f.name === "index.md" ||
            f.name.match(/^index\.[a-z]{2}\.md$/) ||
            f.name === "_index.md" ||
            f.name.match(/^_index\.[a-z]{2}\.md$/),
    );

    if (indexFile) {
        const isLeaf = indexFile.name.startsWith("index");
        const bundleType: BundleType = isLeaf ? "leaf" : "branch";

        const bundle = await createPageBundle(
            currentDir,
            baseDir,
            files,
            bundleType,
            includeDrafts,
            resolver,
            parseOptions,
        );

        bundles.push(bundle);

        for (const dir of directories) {
            const childBundles: PageBundle[] = [];
            await scanForBundles(
                join(currentDir, dir.name),
                baseDir,
                childBundles,
                includeDrafts,
                resolver,
                parseOptions,
            );
            bundle.children.push(...childBundles);
        }
    } else {
        for (const dir of directories) {
            await scanForBundles(
                join(currentDir, dir.name),
                baseDir,
                bundles,
                includeDrafts,
                resolver,
                parseOptions,
            );
        }

        for (const file of files) {
            if (file.name.endsWith(".md")) {
                const content = await processContent(
                    join(currentDir, file.name),
                    baseDir,
                    resolver,
                    parseOptions,
                );

                if (content && (includeDrafts || !content.frontmatter.draft)) {
                    const bundle: PageBundle = {
                        type: "none",
                        path: relative(baseDir, currentDir) || ".",
                        content,
                        resources: [],
                        children: [],
                    };
                    bundles.push(bundle);
                }
            }
        }
    }
}

/**
 * 创建页面包
 * @param bundleDir 包目录
 * @param baseDir 基础目录
 * @param files 文件列表
 * @param bundleType 包类型
 * @param includeDrafts 是否包含草稿
 * @param resolver 语言解析器
 * @param parseOptions 解析选项
 * @returns 页面包对象
 */
async function createPageBundle(
    bundleDir: string,
    baseDir: string,
    files: import("fs").Dirent[],
    bundleType: BundleType,
    includeDrafts: boolean,
    resolver: LanguageResolver,
    parseOptions?: MarkdownParseOptions,
): Promise<PageBundle> {
    const bundlePath = relative(baseDir, bundleDir) || ".";
    const resources: string[] = [];
    let content: Content | null = null;

    for (const file of files) {
        const fileName = file.name;

        if (
            fileName === "index.md" ||
            fileName === "_index.md" ||
            fileName.match(/^(?:index|_index)\.[a-z]{2}\.md$/)
        ) {
            const processed = await processContent(
                join(bundleDir, fileName),
                baseDir,
                resolver,
                parseOptions,
            );

            if (processed && (includeDrafts || !processed.frontmatter.draft)) {
                content = processed;
            }
        } else if (!fileName.endsWith(".md")) {
            resources.push(fileName);
        }
    }

    return {
        type: bundleType,
        path: bundlePath,
        content,
        resources,
        children: [],
    };
}

/**
 * 获取页面包的资源 URL 映射
 * @param bundle 页面包
 * @param outputDir 输出目录
 * @returns 资源文件名到输出路径的映射
 */
export function getBundleResourceUrls(
    bundle: PageBundle,
    outputDir: string,
): Map<string, string> {
    const resourceUrls = new Map<string, string>();

    for (const resource of bundle.resources) {
        const resourcePath = join(outputDir, resource);
        resourceUrls.set(resource, resourcePath);
    }

    return resourceUrls;
}

/**
 * 展平页面包树为列表
 * @param bundles 页面包数组
 * @returns 所有页面包的扁平列表
 */
export function flattenBundles(bundles: PageBundle[]): PageBundle[] {
    const result: PageBundle[] = [];

    for (const bundle of bundles) {
        result.push(bundle);
        if (bundle.children.length > 0) {
            result.push(...flattenBundles(bundle.children));
        }
    }

    return result;
}

/**
 * 获取所有包含内容的页面包
 * @param bundles 页面包数组
 * @returns 包含内容的页面包数组
 */
export function getBundlesWithContent(bundles: PageBundle[]): PageBundle[] {
    return flattenBundles(bundles).filter((b) => b.content !== null);
}
