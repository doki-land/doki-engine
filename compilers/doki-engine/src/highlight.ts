/** 语法高亮模块 */

import {
    createHighlighter as createShikiHighlighter,
    type Highlighter as ShikiHighlighter,
} from "shiki";
import type { HighlightConfig } from "./config.js";

/** 高亮选项 */
export interface HighlightOptions {
    /** 是否显示行号 */
    lineNumbers?: boolean;
    /** 高亮的行号 */
    highlightLines?: number[];
    /** 起始行号 */
    startLine?: number;
}

/** 语法高亮器 */
export interface Highlighter {
    /** 高亮代码 */
    highlight(
        code: string,
        lang: string,
        options?: HighlightOptions,
    ): Promise<string>;
    /** 获取支持的语法列表 */
    getLoadedLanguages(): string[];
}

/** 解析代码块元信息的结果 */
export interface ParsedCodeMeta {
    /** 语言 */
    lang: string;
    /** 高亮的行号列表 */
    highlightLines: number[];
    /** 是否显示行号 */
    lineNumbers: boolean;
    /** 起始行号 */
    startLine: number;
}

/**
 * 解析代码块元信息
 * @param meta 代码块元信息字符串
 * @returns 解析后的元信息对象
 * @example
 * parseCodeMeta('typescript {1,3-5}') // { lang: 'typescript', highlightLines: [1,3,4,5], lineNumbers: false, startLine: 1 }
 * parseCodeMeta('typescript :10') // { lang: 'typescript', highlightLines: [], lineNumbers: false, startLine: 10 }
 * parseCodeMeta('typescript showLineNumbers') // { lang: 'typescript', highlightLines: [], lineNumbers: true, startLine: 1 }
 */
export function parseCodeMeta(meta: string): ParsedCodeMeta {
    const result: ParsedCodeMeta = {
        lang: "",
        highlightLines: [],
        lineNumbers: false,
        startLine: 1,
    };

    const trimmedMeta = meta.trim();
    if (!trimmedMeta) {
        return result;
    }

    const parts = trimmedMeta.split(/\s+/);
    result.lang = parts[0] || "";

    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];

        if (part === "showLineNumbers") {
            result.lineNumbers = true;
        } else if (part.startsWith(":")) {
            const lineNum = parseInt(part.slice(1), 10);
            if (!isNaN(lineNum) && lineNum > 0) {
                result.startLine = lineNum;
            }
        } else if (part.startsWith("{") && part.endsWith("}")) {
            const lineSpec = part.slice(1, -1);
            result.highlightLines = parseLineSpec(lineSpec);
        }
    }

    return result;
}

/**
 * 解析行号规格字符串
 * @param spec 行号规格，如 "1,3-5,7"
 * @returns 行号数组
 */
function parseLineSpec(spec: string): number[] {
    const lines: number[] = [];
    const ranges = spec.split(",");

    for (const range of ranges) {
        const trimmedRange = range.trim();
        if (trimmedRange.includes("-")) {
            const [startStr, endStr] = trimmedRange.split("-");
            const start = parseInt(startStr.trim(), 10);
            const end = parseInt(endStr.trim(), 10);
            if (!isNaN(start) && !isNaN(end) && start > 0 && end >= start) {
                for (let i = start; i <= end; i++) {
                    lines.push(i);
                }
            }
        } else {
            const lineNum = parseInt(trimmedRange, 10);
            if (!isNaN(lineNum) && lineNum > 0) {
                lines.push(lineNum);
            }
        }
    }

    return [...new Set(lines)].sort((a, b) => a - b);
}

/**
 * 创建语法高亮器
 * @param config 语法高亮配置
 * @returns 高亮器实例
 */
export async function createHighlighter(
    config: HighlightConfig,
): Promise<Highlighter> {
    const shikiHighlighter: ShikiHighlighter = await createShikiHighlighter({
        themes: [config.theme],
        langs: [
            "javascript",
            "typescript",
            "python",
            "rust",
            "go",
            "java",
            "c",
            "cpp",
            "html",
            "css",
            "json",
            "yaml",
            "markdown",
            "bash",
            "shell",
        ],
    });

    return {
        async highlight(
            code: string,
            lang: string,
            options?: HighlightOptions,
        ): Promise<string> {
            const showLineNumbers = options?.lineNumbers ?? config.lineNumbers;
            const highlightLines = options?.highlightLines ?? [];
            const startLine = options?.startLine ?? 1;

            let html = await shikiHighlighter.codeToHtml(code, {
                lang: lang || "text",
                theme: config.theme,
            });

            if (showLineNumbers || highlightLines.length > 0) {
                html = addLineFeatures(
                    html,
                    showLineNumbers,
                    highlightLines,
                    startLine,
                );
            }

            return html;
        },

        getLoadedLanguages(): string[] {
            return shikiHighlighter.getLoadedLanguages();
        },
    };
}

/**
 * 为高亮后的 HTML 添加行号和高亮行特性
 * @param html 原始 HTML
 * @param showLineNumbers 是否显示行号
 * @param highlightLines 需要高亮的行号
 * @param startLine 起始行号
 * @returns 处理后的 HTML
 */
function addLineFeatures(
    html: string,
    showLineNumbers: boolean,
    highlightLines: number[],
    startLine: number,
): string {
    const lines = html.split("\n");
    const result: string[] = [];
    let lineNumber = startLine;

    for (const line of lines) {
        if (line.includes('<span class="line">') || line.startsWith("<pre")) {
            if (line.includes('<span class="line">')) {
                let processedLine = line;
                const isHighlighted = highlightLines.includes(lineNumber);

                if (isHighlighted) {
                    processedLine = processedLine.replace(
                        '<span class="line">',
                        '<span class="line highlighted">',
                    );
                }

                if (showLineNumbers) {
                    processedLine = processedLine.replace(
                        '<span class="line',
                        `<span class="line" data-line="${lineNumber}"><span class="line-number">${lineNumber}</span>`,
                    );
                }

                result.push(processedLine);
                lineNumber++;
            } else {
                result.push(line);
            }
        } else {
            result.push(line);
        }
    }

    return result.join("\n");
}

/**
 * 高亮代码块
 * @param code 代码内容
 * @param lang 语言
 * @param config 语法高亮配置
 * @param options 高亮选项
 * @returns 高亮后的 HTML 字符串
 */
export async function highlightCode(
    code: string,
    lang: string,
    config: HighlightConfig,
    options?: HighlightOptions,
): Promise<string> {
    if (!config.enabled) {
        return escapeHtml(code);
    }

    const highlighter = await createHighlighter(config);
    return highlighter.highlight(code, lang, options);
}

/**
 * 转义 HTML 特殊字符
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
