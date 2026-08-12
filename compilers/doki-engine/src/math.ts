/**
 * Doki Engine 数学公式渲染模块
 *
 * 提供 KaTeX 和 MathJax 数学公式的渲染支持。
 */

import type { MathConfig, MathEngine } from "./config.js";

/** 数学公式渲染结果 */
export interface MathRenderResult {
    /** 渲染后的 HTML */
    html: string;
    /** 是否为块级公式 */
    isBlock: boolean;
    /** 原始公式文本 */
    source: string;
}

/** 数学公式解析结果 */
export interface ParsedMath {
    /** 公式文本 */
    formula: string;
    /** 是否为块级公式 */
    isBlock: boolean;
    /** 在源文本中的起始位置 */
    startIndex: number;
    /** 在源文本中的结束位置 */
    endIndex: number;
}

/** 数学渲染器接口 */
export interface MathRenderer {
    /** 渲染器名称 */
    readonly name: MathEngine;
    /**
     * 渲染数学公式
     * @param formula 公式文本
     * @param isBlock 是否为块级公式
     * @returns 渲染后的 HTML
     */
    render(formula: string, isBlock: boolean): string;
    /**
     * 获取所需的 CSS 样式表
     * @returns CSS 样式表内容
     */
    getStyles(): string;
    /**
     * 获取所需的脚本标签
     * @returns 脚本标签 HTML
     */
    getScripts(): string;
}

/** 默认数学配置 */
export const DEFAULT_MATH_CONFIG: MathConfig = {
    enabled: true,
    engine: "katex",
    inlineDelimiters: ["$", "$"],
    blockDelimiters: ["$$", "$$"],
    outputHtml: true,
};

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
 * KaTeX 渲染器
 *
 * 使用 KaTeX CDN 进行客户端渲染，或输出预渲染的 HTML。
 */
export class KatexRenderer implements MathRenderer {
    readonly name: MathEngine = "katex";
    private config: MathConfig;

    /**
     * 创建 KaTeX 渲染器实例
     * @param config 数学配置
     */
    constructor(config: MathConfig = DEFAULT_MATH_CONFIG) {
        this.config = config;
    }

    render(formula: string, isBlock: boolean): string {
        const escapedFormula = escapeHtml(formula);

        if (!this.config.outputHtml) {
            if (isBlock) {
                return `<div class="math math-block" data-engine="katex">${escapedFormula}</div>`;
            }
            return `<span class="math math-inline" data-engine="katex">${escapedFormula}</span>`;
        }

        const displayMode = isBlock ? "true" : "false";
        const tag = isBlock ? "div" : "span";
        const className = isBlock
            ? "math math-block katex-display"
            : "math math-inline katex-inline";

        return `<${tag} class="${className}" data-formula="${escapedFormula}" data-display-mode="${displayMode}"></${tag}>`;
    }

    getStyles(): string {
        if (!this.config.outputHtml) {
            return "";
        }
        return `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" integrity="sha384-n8MVd4RsNIU0tAv4ct0nTaAbDJwPJzDEaqSD1odI+WdtXRGWt2kTvGFasHpSy3SV" crossorigin="anonymous">`;
    }

    getScripts(): string {
        if (!this.config.outputHtml) {
            return "";
        }
        return `<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js" integrity="sha384-XjKyOOlGwcjNTAIQHIpgOno0Hl1YQqzUOEleOLALmuqehneUG+vnGctmUbKyIyUH" crossorigin="anonymous"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" integrity="sha384-+VBxd3r6XgURycqtZ117nYw44OOcIax56Z4dCRWbxyPt0Koah1uHoK0o4+/RRE05" crossorigin="anonymous"></script>
<script>
document.addEventListener("DOMContentLoaded", function() {
    renderMathInElement(document.body, {
        delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false},
            {left: '\\\\[', right: '\\\\]', display: true},
            {left: '\\\\(', right: '\\\\)', display: false}
        ]
    });
});
</script>`;
    }
}

/**
 * MathJax 渲染器
 *
 * 使用 MathJax CDN 进行客户端渲染。
 */
export class MathJaxRenderer implements MathRenderer {
    readonly name: MathEngine = "mathjax";
    private config: MathConfig;

    /**
     * 创建 MathJax 渲染器实例
     * @param config 数学配置
     */
    constructor(config: MathConfig = DEFAULT_MATH_CONFIG) {
        this.config = config;
    }

    render(formula: string, isBlock: boolean): string {
        const escapedFormula = escapeHtml(formula);

        if (!this.config.outputHtml) {
            if (isBlock) {
                return `<div class="math math-block" data-engine="mathjax">${escapedFormula}</div>`;
            }
            return `<span class="math math-inline" data-engine="mathjax">${escapedFormula}</span>`;
        }

        if (isBlock) {
            return `\\[${escapedFormula}\\]`;
        }
        return `\\(${escapedFormula}\\)`;
    }

    getStyles(): string {
        return "";
    }

    getScripts(): string {
        if (!this.config.outputHtml) {
            return "";
        }

        const version = this.config.mathjaxOptions?.version ?? 3;

        if (version === 2) {
            return `<script src="https://cdn.jsdelivr.net/npm/mathjax@2/MathJax.js?config=TeX-AMS-MML_HTMLorMML"></script>`;
        }

        return `<script>
window.MathJax = {
    tex: {
        inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
        displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']]
    },
    svg: {
        fontCache: 'global'
    },
    startup: {
        ready: function() {
            MathJax.startup.defaultReady();
        }
    }
};
</script>
<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>`;
    }
}

/**
 * 创建数学渲染器
 *
 * 根据配置创建对应的渲染器实例。
 *
 * @param config 数学配置
 * @returns 数学渲染器实例
 */
export function createMathRenderer(
    config: MathConfig = DEFAULT_MATH_CONFIG,
): MathRenderer {
    switch (config.engine) {
        case "mathjax":
            return new MathJaxRenderer(config);
        case "katex":
        default:
            return new KatexRenderer(config);
    }
}

/**
 * 解析文本中的数学公式
 *
 * 识别行内公式和块级公式。
 *
 * @param text 源文本
 * @param config 数学配置
 * @returns 解析后的公式数组
 */
export function parseMathFormulas(
    text: string,
    config: MathConfig = DEFAULT_MATH_CONFIG,
): ParsedMath[] {
    const results: ParsedMath[] = [];
    const [inlineStart, inlineEnd] = config.inlineDelimiters;
    const [blockStart, blockEnd] = config.blockDelimiters;

    const blockPattern = new RegExp(
        escapeRegExp(blockStart) + "([\\s\\S]*?)" + escapeRegExp(blockEnd),
        "g",
    );

    let match: RegExpExecArray | null;
    const blockRanges: Array<{ start: number; end: number }> = [];

    while ((match = blockPattern.exec(text)) !== null) {
        const formula = match[1].trim();
        results.push({
            formula,
            isBlock: true,
            startIndex: match.index,
            endIndex: match.index + match[0].length,
        });
        blockRanges.push({
            start: match.index,
            end: match.index + match[0].length,
        });
    }

    const inlinePattern = new RegExp(
        escapeRegExp(inlineStart) +
            "([^" +
            escapeRegExp(inlineStart[0]) +
            "\\n]+?)" +
            escapeRegExp(inlineEnd),
        "g",
    );

    while ((match = inlinePattern.exec(text)) !== null) {
        const isInBlock = blockRanges.some(
            (range) => match!.index >= range.start && match!.index < range.end,
        );

        if (!isInBlock) {
            const formula = match[1].trim();
            results.push({
                formula,
                isBlock: false,
                startIndex: match.index,
                endIndex: match.index + match[0].length,
            });
        }
    }

    results.sort((a, b) => a.startIndex - b.startIndex);
    return results;
}

/**
 * 转义正则表达式特殊字符
 *
 * @param str 原始字符串
 * @returns 转义后的字符串
 */
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 渲染文本中的数学公式
 *
 * 将文本中的数学公式替换为渲染后的 HTML。
 *
 * @param text 源文本
 * @param config 数学配置
 * @returns 渲染后的文本
 */
export function renderMathInText(
    text: string,
    config: MathConfig = DEFAULT_MATH_CONFIG,
): string {
    if (!config.enabled) {
        return text;
    }

    const renderer = createMathRenderer(config);
    const formulas = parseMathFormulas(text, config);

    if (formulas.length === 0) {
        return text;
    }

    let result = text;
    let offset = 0;

    for (const math of formulas) {
        const rendered = renderer.render(math.formula, math.isBlock);
        const start = math.startIndex + offset;
        const end = math.endIndex + offset;
        const originalLength = end - start;

        result = result.slice(0, start) + rendered + result.slice(end);
        offset += rendered.length - originalLength;
    }

    return result;
}

/**
 * 获取数学渲染所需的头部标签
 *
 * 返回需要插入到 HTML 头部的样式表和脚本标签。
 *
 * @param config 数学配置
 * @returns 头部标签 HTML
 */
export function getMathHeadTags(
    config: MathConfig = DEFAULT_MATH_CONFIG,
): string {
    if (!config.enabled) {
        return "";
    }

    const renderer = createMathRenderer(config);
    const tags: string[] = [];

    const styles = renderer.getStyles();
    if (styles) {
        tags.push(styles);
    }

    return tags.join("\n");
}

/**
 * 获取数学渲染所需的底部标签
 *
 * 返回需要插入到 HTML 底部的脚本标签。
 *
 * @param config 数学配置
 * @returns 底部标签 HTML
 */
export function getMathFooterTags(
    config: MathConfig = DEFAULT_MATH_CONFIG,
): string {
    if (!config.enabled) {
        return "";
    }

    const renderer = createMathRenderer(config);
    return renderer.getScripts();
}

/**
 * 检查文本是否包含数学公式
 *
 * @param text 源文本
 * @param config 数学配置
 * @returns 是否包含数学公式
 */
export function hasMathFormulas(
    text: string,
    config: MathConfig = DEFAULT_MATH_CONFIG,
): boolean {
    if (!config.enabled) {
        return false;
    }

    const [inlineStart] = config.inlineDelimiters;
    const [blockStart] = config.blockDelimiters;

    return text.includes(inlineStart) || text.includes(blockStart);
}

/**
 * 数学处理器类
 *
 * 提供完整的数学公式处理功能。
 */
export class MathProcessor {
    private config: MathConfig;
    private renderer: MathRenderer;

    /**
     * 创建数学处理器实例
     * @param config 数学配置
     */
    constructor(config: MathConfig = DEFAULT_MATH_CONFIG) {
        this.config = config;
        this.renderer = createMathRenderer(config);
    }

    /**
     * 处理 Markdown 内容中的数学公式
     *
     * 在 Markdown 解析前预处理数学公式，避免被 Markdown 解析器干扰。
     *
     * @param markdown Markdown 内容
     * @returns 预处理后的内容
     */
    preprocessMarkdown(markdown: string): string {
        if (!this.config.enabled) {
            return markdown;
        }

        return markdown
            .replace(/\$\$([\s\S]*?)\$\$/g, (_, formula) => {
                const escaped = formula.trim();
                return `<div class="math-placeholder math-block" data-formula="${escapeHtml(escaped)}"></div>`;
            })
            .replace(/\$([^$\n]+?)\$/g, (_, formula) => {
                const escaped = formula.trim();
                return `<span class="math-placeholder math-inline" data-formula="${escapeHtml(escaped)}"></span>`;
            });
    }

    /**
     * 后处理 HTML 内容中的数学公式
     *
     * 将占位符替换为实际的数学渲染结果。
     *
     * @param html HTML 内容
     * @returns 处理后的 HTML
     */
    postprocessHtml(html: string): string {
        if (!this.config.enabled) {
            return html;
        }

        return html
            .replace(
                /<div class="math-placeholder math-block" data-formula="([^"]*)"><\/div>/g,
                (_, formula) => {
                    return this.renderer.render(formula, true);
                },
            )
            .replace(
                /<span class="math-placeholder math-inline" data-formula="([^"]*)"><\/span>/g,
                (_, formula) => {
                    return this.renderer.render(formula, false);
                },
            );
    }

    /**
     * 获取渲染器实例
     *
     * @returns 数学渲染器
     */
    getRenderer(): MathRenderer {
        return this.renderer;
    }

    /**
     * 获取配置
     *
     * @returns 数学配置
     */
    getConfig(): MathConfig {
        return this.config;
    }
}

/**
 * 创建数学处理器
 *
 * @param config 数学配置
 * @returns 数学处理器实例
 */
export function createMathProcessor(
    config: MathConfig = DEFAULT_MATH_CONFIG,
): MathProcessor {
    return new MathProcessor(config);
}
