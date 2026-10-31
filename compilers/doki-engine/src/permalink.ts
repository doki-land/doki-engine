/** Doki Engine 永久链接模块 */

import type { PermalinkConfig } from "./config.js";
import type { Content } from "./content.js";

/** 永久链接上下文，用于替换占位符 */
export interface PermalinkContext {
    /** 年份（4位数字） */
    year?: string;
    /** 月份（2位数字） */
    month?: string;
    /** 日期（2位数字） */
    day?: string;
    /** URL 友好的标题标识符 */
    slug?: string;
    /** 章节名称 */
    section?: string;
    /** 分类路径 */
    categories?: string;
    /** 原始标题 */
    title?: string;
    /** 其他自定义字段 */
    [key: string]: string | undefined;
}

/**
 * 将字符串转换为 URL 友好的 slug 格式
 *
 * @param str 原始字符串
 * @returns URL 友好的 slug
 */
export function slugify(str: string): string {
    return str
        .toLowerCase()
        .trim()
        .replace(/[\s_]+/g, "-")
        .replace(/[^\w\u4e00-\u9fa5-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

/**
 * 解析永久链接模式，替换占位符为实际值
 *
 * 支持的占位符：
 * - `:year` - 年份（4位数字）
 * - `:month` - 月份（2位数字）
 * - `:day` - 日期（2位数字）
 * - `:slug` - URL 友好的标题标识符
 * - `:section` - 章节名称
 * - `:categories` - 分类路径
 * - `:title` - 原始标题（经 slug 处理）
 *
 * @param pattern URL 模式字符串
 * @param context 占位符替换上下文
 * @returns 替换后的 URL 路径
 */
export function parsePermalinkPattern(
    pattern: string,
    context: PermalinkContext,
): string {
    let result = pattern;

    const placeholders: Record<string, string | undefined> = {
        year: context.year || "",
        month: context.month || "",
        day: context.day || "",
        slug: context.slug || "",
        section: context.section || "",
        categories: context.categories || "",
        title: context.title || "",
    };

    for (const [key, value] of Object.entries(placeholders)) {
        const regex = new RegExp(`:${key}`, "g");
        result = result.replace(regex, value as string);
    }

    for (const [key, value] of Object.entries(context)) {
        if (!Object.hasOwn(placeholders, key) && value !== undefined) {
            const regex = new RegExp(`:${key}`, "g");
            result = result.replace(regex, value as string);
        }
    }

    result = result.replace(/\/+/g, "/");

    return result;
}

/**
 * 从日期字符串中提取年月日
 *
 * @param dateStr 日期字符串
 * @returns 包含年月日的对象
 */
function extractDateParts(dateStr: string | undefined): {
    year: string;
    month: string;
    day: string;
} {
    if (!dateStr) {
        const now = new Date();
        return {
            year: now.getFullYear().toString(),
            month: String(now.getMonth() + 1).padStart(2, "0"),
            day: String(now.getDate()).padStart(2, "0"),
        };
    }

    const date = new Date(dateStr);

    if (Number.isNaN(date.getTime())) {
        const now = new Date();
        return {
            year: now.getFullYear().toString(),
            month: String(now.getMonth() + 1).padStart(2, "0"),
            day: String(now.getDate()).padStart(2, "0"),
        };
    }

    return {
        year: date.getFullYear().toString(),
        month: String(date.getMonth() + 1).padStart(2, "0"),
        day: String(date.getDate()).padStart(2, "0"),
    };
}

/**
 * 从内容路径中提取章节信息
 *
 * @param relativePath 相对路径
 * @returns 章节名称
 */
function extractSection(relativePath: string): string {
    const parts = relativePath.split(/[/\\]/);

    if (parts.length > 1) {
        return slugify(parts[0]);
    }

    return "";
}

/**
 * 从内容对象构建永久链接上下文
 *
 * @param content 内容对象
 * @returns 永久链接上下文
 */
export function buildPermalinkContext(content: Content): PermalinkContext {
    const dateParts = extractDateParts(
        content.frontmatter.date as string | undefined,
    );

    const title = content.frontmatter.title || "untitled";
    const slug = slugify(title);

    const section = content.frontmatter.section
        ? slugify(content.frontmatter.section as string)
        : extractSection(content.relativePath);

    let categories = "";
    if (content.frontmatter.category) {
        categories = slugify(content.frontmatter.category as string);
    } else if (
        content.frontmatter.tags &&
        Array.isArray(content.frontmatter.tags) &&
        content.frontmatter.tags.length > 0
    ) {
        categories = slugify(content.frontmatter.tags[0] as string);
    }

    const context: PermalinkContext = {
        year: dateParts.year,
        month: dateParts.month,
        day: dateParts.day,
        slug,
        section,
        categories,
        title: slug,
    };

    if (content.frontmatter.author) {
        context.author = slugify(content.frontmatter.author as string);
    }

    return context;
}

/**
 * 根据配置和内容生成永久链接
 *
 * @param config 永久链接配置
 * @param content 内容对象
 * @returns 生成的 URL 路径
 */
export function generatePermalink(
    config: PermalinkConfig,
    content: Content,
): string {
    const customPermalink = content.frontmatter.permalink as string | undefined;

    if (customPermalink) {
        let url = customPermalink;

        if (!url.startsWith("/")) {
            url = `/${url}`;
        }

        if (config.trailingSlash && !url.endsWith("/")) {
            url = `${url}/`;
        } else if (!config.trailingSlash && url.endsWith("/")) {
            url = url.slice(0, -1);
        }

        return url;
    }

    const context = buildPermalinkContext(content);

    let url = parsePermalinkPattern(config.pattern, context);

    if (!url.startsWith("/")) {
        url = `/${url}`;
    }

    if (config.trailingSlash && !url.endsWith("/")) {
        url = `${url}/`;
    } else if (!config.trailingSlash && url.endsWith("/")) {
        url = url.slice(0, -1);
    }

    return url;
}

/**
 * 验证永久链接模式是否有效
 *
 * @param pattern URL 模式字符串
 * @returns 是否有效
 */
export function validatePermalinkPattern(pattern: string): boolean {
    if (!pattern || typeof pattern !== "string") {
        return false;
    }

    const validPlaceholders = [
        "year",
        "month",
        "day",
        "slug",
        "section",
        "categories",
        "title",
    ];

    const placeholderRegex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let match: RegExpExecArray | null;

    match = placeholderRegex.exec(pattern);
    while (match !== null) {
        const placeholder = match[1];
        if (!validPlaceholders.includes(placeholder)) {
            console.warn(`Unknown permalink placeholder: :${placeholder}`);
        }
        match = placeholderRegex.exec(pattern);
    }

    return true;
}

/**
 * 获取默认永久链接配置
 *
 * @returns 默认永久链接配置
 */
export function getDefaultPermalinkConfig(): PermalinkConfig {
    return {
        pattern: "/:section/:slug/",
        trailingSlash: true,
    };
}
