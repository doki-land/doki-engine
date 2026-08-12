/**
 * Doki Engine 短代码系统模块
 *
 * 提供短代码的注册、解析和渲染功能。
 */

import type { DokiConfig } from "./config.js";

/** 短代码参数类型 */
export type ShortcodeParamType = "string" | "number" | "boolean" | "array";

/**
 * 短代码参数定义
 *
 * 定义短代码接受的参数及其属性。
 */
export interface ShortcodeParam {
    /** 参数名称 */
    name: string;
    /** 参数类型 */
    type: ShortcodeParamType;
    /** 是否必需 */
    required: boolean;
    /** 默认值 */
    default?: unknown;
    /** 参数描述 */
    description?: string;
}

/**
 * 短代码参数容器
 *
 * 包含命名参数和位置参数。
 */
export interface ShortcodeArgs {
    /** 命名参数映射 */
    named: Record<string, unknown>;
    /** 位置参数数组 */
    positional: unknown[];
}

/**
 * 短代码渲染上下文
 *
 * 提供短代码渲染时可访问的上下文数据。
 */
export interface RenderContext {
    /** 当前页面变量 */
    page: Record<string, unknown>;
    /** 站点变量 */
    site: Record<string, unknown>;
    /** 配置对象 */
    config: DokiConfig;
}

/**
 * 短代码定义
 *
 * 定义一个完整的短代码，包括名称、参数和渲染函数。
 */
export interface Shortcode {
    /** 短代码名称 */
    name: string;
    /** 参数定义列表 */
    params: ShortcodeParam[];
    /** 是否支持内容（块级短代码） */
    acceptsContent: boolean;
    /**
     * 渲染函数
     *
     * @param args 参数容器
     * @param content 内容（仅块级短代码有值）
     * @param context 渲染上下文
     * @returns 渲染后的 HTML 字符串
     */
    render: (
        args: ShortcodeArgs,
        content: string | null,
        context: RenderContext,
    ) => string;
}

/**
 * 解析后的短代码
 *
 * 表示从源文本中解析出的短代码实例。
 */
export interface ParsedShortcode {
    /** 短代码名称 */
    name: string;
    /** 参数容器 */
    args: ShortcodeArgs;
    /** 内容（仅块级短代码有值） */
    content: string | null;
    /** 是否为自闭合短代码 */
    isSelfClosing: boolean;
    /** 在源文本中的起始位置 */
    startIndex: number;
    /** 在源文本中的结束位置 */
    endIndex: number;
}

/**
 * 短代码注册表
 *
 * 管理短代码的注册、查找和渲染。
 */
export class ShortcodeRegistry {
    /** 短代码映射表 */
    private shortcodes: Map<string, Shortcode>;

    /**
     * 创建短代码注册表实例
     */
    constructor() {
        this.shortcodes = new Map();
    }

    /**
     * 注册短代码
     *
     * @param shortcode 短代码定义
     */
    register(shortcode: Shortcode): void {
        this.shortcodes.set(shortcode.name, shortcode);
    }

    /**
     * 获取短代码
     *
     * @param name 短代码名称
     * @returns 短代码定义，不存在则返回 undefined
     */
    get(name: string): Shortcode | undefined {
        return this.shortcodes.get(name);
    }

    /**
     * 检查短代码是否存在
     *
     * @param name 短代码名称
     * @returns 是否存在
     */
    has(name: string): boolean {
        return this.shortcodes.has(name);
    }

    /**
     * 获取所有已注册的短代码
     *
     * @returns 短代码数组
     */
    getAll(): Shortcode[] {
        return Array.from(this.shortcodes.values());
    }

    /**
     * 渲染短代码
     *
     * @param name 短代码名称
     * @param args 参数容器
     * @param content 内容
     * @param context 渲染上下文
     * @returns 渲染后的 HTML 字符串
     */
    render(
        name: string,
        args: ShortcodeArgs,
        content: string | null,
        context: RenderContext,
    ): string {
        const shortcode = this.get(name);
        if (!shortcode) {
            console.warn(`Shortcode not found: ${name}`);
            return "";
        }

        const processedArgs = this.applyDefaults(args, shortcode);
        return shortcode.render(processedArgs, content, context);
    }

    /**
     * 应用参数默认值
     *
     * @param args 原始参数
     * @param shortcode 短代码定义
     * @returns 处理后的参数容器
     */
    private applyDefaults(
        args: ShortcodeArgs,
        shortcode: Shortcode,
    ): ShortcodeArgs {
        const named = { ...args.named };

        for (const param of shortcode.params) {
            if (
                named[param.name] === undefined &&
                param.default !== undefined
            ) {
                named[param.name] = param.default;
            }
        }

        return { named, positional: args.positional };
    }
}

/**
 * 短代码解析器
 *
 * 从源文本中解析短代码语法。
 */
export class ShortcodeParser {
    /**
     * 创建短代码解析器实例
     */
    constructor() {
        // 解析器不需要初始化状态
    }

    /**
     * 解析源文本中的所有短代码
     *
     * @param source 源文本
     * @returns 解析后的短代码数组
     */
    parse(source: string): ParsedShortcode[] {
        const results: ParsedShortcode[] = [];
        let processedSource = source;

        // 首先解析块级短代码
        processedSource = this.parseBlockShortcodes(processedSource, results);

        // 然后解析自闭合短代码
        this.parseSelfClosingShortcodes(processedSource, results);

        // 按起始位置排序
        results.sort((a, b) => a.startIndex - b.startIndex);

        return results;
    }

    /**
     * 解析块级短代码
     *
     * @param source 源文本
     * @param results 结果数组
     * @returns 处理后的源文本
     */
    private parseBlockShortcodes(
        source: string,
        results: ParsedShortcode[],
    ): string {
        const blockPattern =
            /\{%\s*(\w+)\s*([^%]*)\s*%\}([\s\S]*?)\{%\s*end\1\s*%\}/g;
        let match: RegExpExecArray | null;

        while ((match = blockPattern.exec(source)) !== null) {
            const name = match[1];
            const paramString = match[2].trim();
            const content = match[3].trim();
            const args = this.parseParams(paramString);

            results.push({
                name,
                args,
                content,
                isSelfClosing: false,
                startIndex: match.index,
                endIndex: match.index + match[0].length,
            });
        }

        // 移除已解析的块级短代码，避免重复解析
        return source.replace(blockPattern, (match) =>
            "\x00".repeat(match.length),
        );
    }

    /**
     * 解析自闭合短代码
     *
     * @param source 源文本
     * @param results 结果数组
     */
    private parseSelfClosingShortcodes(
        source: string,
        results: ParsedShortcode[],
    ): void {
        const pattern = /\{%\s*(\w+)\s+([^%]*)\s*%\}/g;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(source)) !== null) {
            // 跳过已被解析的块级短代码
            if (match[0].includes("\x00")) {
                continue;
            }

            const name = match[1];
            const paramString = match[2].trim();
            const args = this.parseParams(paramString);

            // 检查是否已经作为块级短代码解析过
            const alreadyParsed = results.some(
                (r) => r.startIndex === match!.index,
            );

            if (!alreadyParsed) {
                results.push({
                    name,
                    args,
                    content: null,
                    isSelfClosing: true,
                    startIndex: match.index,
                    endIndex: match.index + match[0].length,
                });
            }
        }
    }

    /**
     * 解析参数字符串
     *
     * @param paramString 参数字符串
     * @returns 参数容器
     */
    parseParams(paramString: string): ShortcodeArgs {
        const named: Record<string, unknown> = {};
        const positional: unknown[] = [];

        if (!paramString.trim()) {
            return { named, positional };
        }

        // 匹配命名参数: name="value" 或 name='value' 或 name=value
        const namedPattern =
            /(\w+)=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+)/g;
        let match: RegExpExecArray | null;

        while ((match = namedPattern.exec(paramString)) !== null) {
            const name = match[1];
            const rawValue = match[2];
            named[name] = this.parseValue(rawValue);
        }

        // 移除已解析的命名参数，剩余的作为位置参数
        const remaining = paramString.replace(namedPattern, "").trim();
        if (remaining) {
            const positionalPattern =
                /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+)/g;
            while ((match = positionalPattern.exec(remaining)) !== null) {
                positional.push(this.parseValue(match[1]));
            }
        }

        return { named, positional };
    }

    /**
     * 解析单个值
     *
     * @param rawValue 原始值字符串
     * @returns 解析后的值
     */
    private parseValue(rawValue: string): unknown {
        // 移除引号
        if (
            (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
            (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ) {
            const unquoted = rawValue.slice(1, -1);
            // 处理转义字符
            return unquoted.replace(/\\(.)/g, "$1");
        }

        // 布尔值
        if (rawValue.toLowerCase() === "true") {
            return true;
        }
        if (rawValue.toLowerCase() === "false") {
            return false;
        }

        // 数字
        const num = Number(rawValue);
        if (!isNaN(num)) {
            return num;
        }

        // 字符串
        return rawValue;
    }
}

/**
 * HTML 转义函数
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
 * 创建图片短代码
 *
 * @returns 图片短代码定义
 */
export function createImageShortcode(): Shortcode {
    return {
        name: "image",
        params: [
            {
                name: "src",
                type: "string",
                required: true,
                description: "图片路径",
            },
            {
                name: "alt",
                type: "string",
                required: false,
                default: "",
                description: "替代文本",
            },
            {
                name: "class",
                type: "string",
                required: false,
                default: "",
                description: "CSS 类名",
            },
            {
                name: "lazy",
                type: "boolean",
                required: false,
                default: true,
                description: "是否懒加载",
            },
        ],
        acceptsContent: false,
        render: (args) => {
            const src = args.named.src as string;
            const alt = args.named.alt as string;
            const className = args.named.class as string;
            const lazy = args.named.lazy as boolean;

            const classAttr = className
                ? ` class="${escapeHtml(className)}"`
                : "";
            const lazyAttr = lazy ? ' loading="lazy"' : "";

            return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${classAttr}${lazyAttr}>`;
        },
    };
}

/**
 * 创建 YouTube 短代码
 *
 * @returns YouTube 短代码定义
 */
export function createYoutubeShortcode(): Shortcode {
    return {
        name: "youtube",
        params: [
            {
                name: "id",
                type: "string",
                required: true,
                description: "视频 ID",
            },
            {
                name: "width",
                type: "number",
                required: false,
                default: 560,
                description: "宽度",
            },
            {
                name: "height",
                type: "number",
                required: false,
                default: 315,
                description: "高度",
            },
        ],
        acceptsContent: false,
        render: (args) => {
            const id = args.named.id as string;
            const width = args.named.width as number;
            const height = args.named.height as number;

            return `<iframe src="https://www.youtube.com/embed/${escapeHtml(id)}" width="${width}" height="${height}" frameborder="0" allowfullscreen></iframe>`;
        },
    };
}

/**
 * 创建 GitHub Gist 短代码
 *
 * @returns Gist 短代码定义
 */
export function createGistShortcode(): Shortcode {
    return {
        name: "gist",
        params: [
            {
                name: "user",
                type: "string",
                required: true,
                description: "GitHub 用户名",
            },
            {
                name: "id",
                type: "string",
                required: true,
                description: "Gist ID",
            },
        ],
        acceptsContent: false,
        render: (args) => {
            const user = args.named.user as string;
            const id = args.named.id as string;

            return `<script src="https://gist.github.com/${escapeHtml(user)}/${escapeHtml(id)}.js"></script>`;
        },
    };
}

/**
 * 创建代码块短代码
 *
 * @returns 代码块短代码定义
 */
export function createCodeShortcode(): Shortcode {
    return {
        name: "code",
        params: [
            {
                name: "lang",
                type: "string",
                required: false,
                default: "text",
                description: "编程语言",
            },
        ],
        acceptsContent: true,
        render: (args, content) => {
            const lang = args.named.lang as string;
            const codeContent = content || "";

            return `<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(codeContent)}</code></pre>`;
        },
    };
}

/**
 * 创建引用短代码
 *
 * @returns 引用短代码定义
 */
export function createQuoteShortcode(): Shortcode {
    return {
        name: "quote",
        params: [
            {
                name: "author",
                type: "string",
                required: false,
                description: "引用作者",
            },
        ],
        acceptsContent: true,
        render: (args, content) => {
            const author = args.named.author as string | undefined;
            const quoteContent = content || "";

            const citeAttr = author ? ` cite="${escapeHtml(author)}"` : "";
            const footer = author
                ? `<footer>— ${escapeHtml(author)}</footer>`
                : "";

            return `<blockquote${citeAttr}><p>${escapeHtml(quoteContent)}</p>${footer}</blockquote>`;
        },
    };
}

/**
 * 创建图表短代码
 *
 * @returns 图表短代码定义
 */
export function createFigureShortcode(): Shortcode {
    return {
        name: "figure",
        params: [
            {
                name: "caption",
                type: "string",
                required: false,
                description: "图片说明",
            },
        ],
        acceptsContent: true,
        render: (args, content) => {
            const caption = args.named.caption as string | undefined;
            const figureContent = content || "";

            const figcaption = caption
                ? `<figcaption>${escapeHtml(caption)}</figcaption>`
                : "";

            return `<figure>${figcaption}${figureContent}</figure>`;
        },
    };
}

/**
 * 创建默认短代码注册表
 *
 * 注册所有内置短代码。
 *
 * @returns 包含内置短代码的注册表
 */
export function createDefaultShortcodeRegistry(): ShortcodeRegistry {
    const registry = new ShortcodeRegistry();

    registry.register(createImageShortcode());
    registry.register(createYoutubeShortcode());
    registry.register(createGistShortcode());
    registry.register(createCodeShortcode());
    registry.register(createQuoteShortcode());
    registry.register(createFigureShortcode());

    return registry;
}
