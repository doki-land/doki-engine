/** Doki Engine Markdown 处理模块 */

import matter from "gray-matter";
import { marked } from "marked";
import type { HighlightConfig, MathConfig } from "./config.js";
import { highlightCode, parseCodeMeta } from "./highlight.js";
import { createMathProcessor, DEFAULT_MATH_CONFIG } from "./math.js";
import {
    type RenderContext,
    ShortcodeParser,
    type ShortcodeRegistry,
} from "./shortcode.js";

/** Frontmatter 元数据 */
export interface Frontmatter {
    /** 页面标题 */
    title?: string;
    /** 发布日期 */
    date?: string;
    /** 页面描述 */
    description?: string;
    /** 布局模板名称 */
    layout?: string;
    /** 是否为草稿 */
    draft?: boolean;
    /** 标签列表 */
    tags?: string[];
    /** 分类名称 */
    category?: string;
    /** 系列名称 */
    series?: string;
    /** 系列中的顺序 */
    series_order?: number;
    /** 作者名称 */
    author?: string;
    /** 章节名称（文档用） */
    section?: string;
    /** 版本号（文档用） */
    version?: string;
    /** 语言标识（文档用） */
    language?: string;
    /** 更新日期 */
    updated?: string;
    /** 排序权重 */
    weight?: number;
    /** 特色图片 URL（用于 OG 标签） */
    image?: string;
    /** 内容语言 */
    lang?: string;
    /** 翻译键 */
    translationKey?: string;
    /** 自定义永久链接 */
    permalink?: string;
    /** 别名路径列表（用于重定向） */
    aliases?: string[];
    /** 其他自定义字段 */
    [key: string]: unknown;
}

/** Markdown 解析选项 */
export interface MarkdownParseOptions {
    /** 短代码注册表 */
    shortcodeRegistry?: ShortcodeRegistry;
    /** 渲染上下文 */
    renderContext?: RenderContext;
    /** 是否处理短代码 */
    processShortcodes?: boolean;
    /** 语法高亮配置 */
    highlightConfig?: HighlightConfig;
    /** 数学公式配置 */
    mathConfig?: MathConfig;
}

/** Markdown 解析结果 */
export interface MarkdownResult {
    frontmatter: Frontmatter;
    content: string;
    html: string;
}

/** 配置 marked 选项 */
marked.setOptions({
    gfm: true,
    breaks: true,
});

/**
 * 转义 HTML 特殊字符
 *
 * @param str 原始字符串
 * @returns 转义后的字符串
 */
function escapeHtml(str: string): string {
    const htmlEntities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    };

    return str.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

/**
 * 创建自定义代码块渲染器
 *
 * 返回一个异步函数，用于渲染代码块并支持语法高亮。
 *
 * @param config 语法高亮配置
 * @returns 代码块渲染函数
 */
function createCodeRenderer(config?: HighlightConfig) {
    return async (
        code: string,
        language: string | undefined,
        _isEscaped: boolean,
    ): Promise<string> => {
        const lang = language || "text";

        if (!config?.enabled) {
            const escapedCode = escapeHtml(code);
            return `<pre><code class="language-${lang}">${escapedCode}</code></pre>`;
        }

        const meta = parseCodeMeta(lang);

        try {
            const highlighted = await highlightCode(code, meta.lang, config, {
                lineNumbers: meta.lineNumbers || config.lineNumbers,
                highlightLines: meta.highlightLines,
                startLine: meta.startLine,
            });
            return highlighted;
        } catch (error) {
            console.warn(`Failed to highlight code block: ${error}`);
            const escapedCode = escapeHtml(code);
            return `<pre><code class="language-${lang}">${escapedCode}</code></pre>`;
        }
    };
}

/**
 * 处理短代码
 *
 * 在 Markdown 内容中查找并渲染短代码。
 *
 * @param content 内容字符串
 * @param registry 短代码注册表
 * @param context 渲染上下文
 * @returns 处理后的内容
 */
function processShortcodes(
    content: string,
    registry: ShortcodeRegistry,
    context: RenderContext,
): string {
    const parser = new ShortcodeParser();
    const parsed = parser.parse(content);

    if (parsed.length === 0) {
        return content;
    }

    let result = content;
    let offset = 0;

    for (const shortcode of parsed) {
        if (!registry.has(shortcode.name)) {
            continue;
        }

        const rendered = registry.render(
            shortcode.name,
            shortcode.args,
            shortcode.content,
            context,
        );

        const start = shortcode.startIndex + offset;
        const end = shortcode.endIndex + offset;
        const originalLength = end - start;

        result = result.slice(0, start) + rendered + result.slice(end);
        offset += rendered.length - originalLength;
    }

    return result;
}

/**
 * 解析 Markdown 文件
 *
 * 解析 Markdown 源码，支持 frontmatter、短代码、数学公式和语法高亮。
 *
 * @param source Markdown 源码
 * @param options 解析选项
 * @returns 解析结果
 */
export async function parseMarkdown(
    source: string,
    options: MarkdownParseOptions = {},
): Promise<MarkdownResult> {
    const { data, content } = matter(source);

    let processedContent = content;

    if (
        options.processShortcodes &&
        options.shortcodeRegistry &&
        options.renderContext
    ) {
        processedContent = processShortcodes(
            processedContent,
            options.shortcodeRegistry,
            options.renderContext,
        );
    }

    const mathConfig = options.mathConfig ?? DEFAULT_MATH_CONFIG;
    const mathProcessor = createMathProcessor(mathConfig);

    if (mathConfig.enabled) {
        processedContent = mathProcessor.preprocessMarkdown(processedContent);
    }

    let html: string;

    if (options.highlightConfig?.enabled) {
        const renderer = createCodeRenderer(options.highlightConfig);
        marked.setOptions({
            gfm: true,
            breaks: true,
            async: true,
        });

        const lexer = new marked.Lexer();
        const tokens = lexer.lex(processedContent);

        for (const token of tokens) {
            if (token.type === "code") {
                token.raw = await renderer(token.text, token.lang, false);
            }
        }

        html = marked.parser(tokens as any);
    } else {
        html = marked.parse(processedContent) as string;
    }

    if (mathConfig.enabled) {
        html = mathProcessor.postprocessHtml(html);
    }

    return {
        frontmatter: data as Frontmatter,
        content: content.trim(),
        html,
    };
}

/** 提取 Frontmatter */
export function extractFrontmatter(source: string): Frontmatter {
    const { data } = matter(source);
    return data as Frontmatter;
}

/** 渲染 Markdown 为 HTML */
export function renderMarkdownToHtml(markdown: string): string {
    return marked.parse(markdown) as string;
}

/** 获取页面变量（用于模板上下文） */
export function getPageVariables(
    frontmatter: Frontmatter,
    html: string,
    url: string,
): Record<string, unknown> {
    return {
        title: frontmatter.title || "Untitled",
        date: frontmatter.date || "",
        description: frontmatter.description || "",
        layout: frontmatter.layout || "layout",
        draft: frontmatter.draft || false,
        tags: frontmatter.tags || [],
        category: frontmatter.category || "",
        series: frontmatter.series || "",
        series_order: frontmatter.series_order || 0,
        author: frontmatter.author || "",
        section: frontmatter.section || "",
        version: frontmatter.version || "",
        language: frontmatter.language || "",
        updated: frontmatter.updated || "",
        weight: frontmatter.weight || 0,
        image: frontmatter.image || "",
        lang: frontmatter.lang || "",
        translationKey: frontmatter.translationKey || "",
        content: html,
        url,
        ...frontmatter,
    };
}
