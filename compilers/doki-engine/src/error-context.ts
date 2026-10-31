/**
 * Doki Engine 错误上下文工具
 *
 * 提供错误上下文提取、错误链追踪和相关错误处理功能。
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { CliError, SourceContext, SourceRange } from "./cli-errors.js";

/**
 * 错误链节点
 */
export interface ErrorChainNode {
    /** 当前错误 */
    error: CliError;
    /** 错误链深度 */
    depth: number;
    /** 原因链 */
    cause?: ErrorChainNode;
}

/**
 * 构建错误链
 */
export function buildErrorChain(
    error: CliError,
    depth: number = 0,
): ErrorChainNode {
    const node: ErrorChainNode = {
        error,
        depth,
    };

    if (error.cause) {
        const causeError = error.cause;
        if ("structured" in causeError) {
            node.cause = buildErrorChain(
                causeError as unknown as CliError,
                depth + 1,
            );
        } else {
            node.cause = buildErrorChain(
                {
                    type: error.type,
                    title: causeError.name || "Error",
                    message: causeError.message,
                    cause: (causeError as any).cause,
                },
                depth + 1,
            );
        }
    }

    return node;
}

/**
 * 从文件提取源代码上下文
 */
export async function extractSourceContextFromFile(
    filePath: string,
    range: SourceRange,
    contextLines: number = 2,
): Promise<SourceContext | null> {
    if (!existsSync(filePath)) {
        return null;
    }

    try {
        const source = await readFile(filePath, "utf-8");
        return extractSourceContextFromSource(source, range, contextLines);
    } catch {
        return null;
    }
}

/**
 * 从源代码字符串提取上下文
 */
export function extractSourceContextFromSource(
    source: string,
    range: SourceRange,
    contextLines: number = 2,
): SourceContext {
    const lines = source.split("\n");
    const targetLine = lines[range.start.line - 1] || "";

    const before: string[] = [];
    const startLine = Math.max(0, range.start.line - 1 - contextLines);
    for (let i = startLine; i < range.start.line - 1; i++) {
        before.push(lines[i] || "");
    }

    const after: string[] = [];
    const endLine = Math.min(lines.length, range.end.line + contextLines);
    for (let i = range.start.line; i < endLine; i++) {
        after.push(lines[i] || "");
    }

    return {
        before,
        line: targetLine,
        after,
        lineNumber: range.start.line,
        startColumn: range.start.column,
        endColumn: range.end.column,
    };
}

/**
 * 格式化错误链
 */
export function formatErrorChain(
    chain: ErrorChainNode,
    indent: number = 0,
): string {
    const indentStr = "  ".repeat(indent);
    const lines: string[] = [];

    lines.push(`${indentStr}→ ${chain.error.title}: ${chain.error.message}`);

    if (chain.error.filePath) {
        let location = chain.error.filePath;
        if (chain.error.line !== undefined) {
            location += `:${chain.error.line}`;
            if (chain.error.column !== undefined) {
                location += `:${chain.error.column}`;
            }
        }
        lines.push(`${indentStr}  位置: ${location}`);
    }

    if (chain.cause) {
        lines.push(`${indentStr}  原因:`);
        lines.push(formatErrorChain(chain.cause, indent + 2));
    }

    return lines.join("\n");
}

/**
 * 收集错误链中的所有错误
 */
export function collectErrorsFromChain(chain: ErrorChainNode): CliError[] {
    const errors: CliError[] = [chain.error];

    if (chain.cause) {
        errors.push(...collectErrorsFromChain(chain.cause));
    }

    return errors;
}

/**
 * 计算错误链深度
 */
export function getErrorChainDepth(chain: ErrorChainNode): number {
    if (!chain.cause) {
        return 1;
    }
    return 1 + getErrorChainDepth(chain.cause);
}

/**
 * 相关错误分组
 */
export interface RelatedErrorGroup {
    /** 主错误 */
    primary: CliError;
    /** 相关错误 */
    related: CliError[];
    /** 分组标签 */
    label: string;
}

/**
 * 按文件分组相关错误
 */
export function groupErrorsByFile(
    errors: CliError[],
): Map<string, RelatedErrorGroup> {
    const groups = new Map<string, RelatedErrorGroup>();

    for (const error of errors) {
        const filePath = error.filePath || "<unknown>";

        if (!groups.has(filePath)) {
            groups.set(filePath, {
                primary: error,
                related: [],
                label: filePath,
            });
        } else {
            groups.get(filePath)?.related.push(error);
        }
    }

    return groups;
}

/**
 * 按类型分组错误
 */
export function groupErrorsByType(
    errors: CliError[],
): Map<string, RelatedErrorGroup> {
    const groups = new Map<string, RelatedErrorGroup>();

    for (const error of errors) {
        const type = error.type;

        if (!groups.has(type)) {
            groups.set(type, {
                primary: error,
                related: [],
                label: type,
            });
        } else {
            groups.get(type)?.related.push(error);
        }
    }

    return groups;
}

/**
 * 错误上下文增强器
 */
export class ErrorContextEnhancer {
    private fileCache: Map<string, string> = new Map();

    /**
     * 增强错误，添加源代码上下文
     */
    async enhance(error: CliError): Promise<CliError> {
        if (error.sourceContext || !error.filePath || !error.range) {
            return error;
        }

        const source = await this.getFileContent(error.filePath);
        if (!source) {
            return error;
        }

        const context = extractSourceContextFromSource(source, error.range);
        return {
            ...error,
            sourceContext: context,
        };
    }

    /**
     * 批量增强错误
     */
    async enhanceAll(errors: CliError[]): Promise<CliError[]> {
        return Promise.all(errors.map((e) => this.enhance(e)));
    }

    /**
     * 获取文件内容（带缓存）
     */
    private async getFileContent(filePath: string): Promise<string | null> {
        if (this.fileCache.has(filePath)) {
            return this.fileCache.get(filePath)!;
        }

        if (!existsSync(filePath)) {
            return null;
        }

        try {
            const content = await readFile(filePath, "utf-8");
            this.fileCache.set(filePath, content);
            return content;
        } catch {
            return null;
        }
    }

    /**
     * 清除缓存
     */
    clearCache(): void {
        this.fileCache.clear();
    }
}

/**
 * 创建增强的错误对象
 */
export async function createEnhancedError(
    baseError: CliError,
    enhancer?: ErrorContextEnhancer,
): Promise<CliError> {
    const enhancerInstance = enhancer || new ErrorContextEnhancer();
    return enhancerInstance.enhance(baseError);
}

/**
 * DejaVu Engine 错误信息接口
 */
export interface DejavuErrorInfo {
    code?: string;
    message: string;
    range?: SourceRange;
    sourceLine?: string;
    suggestions?: Array<{ message: string; replacement?: string }>;
}

/**
 * 从 DejaVu Engine 错误提取结构化信息
 */
export function extractDejavuErrorInfo(error: Error): DejavuErrorInfo | null {
    if (!("structured" in error)) {
        return null;
    }

    const structured = (error as any).structured;
    if (!structured) {
        return null;
    }

    return {
        code: structured.code,
        message: structured.message,
        range: structured.range,
        sourceLine: structured.sourceLine,
        suggestions: structured.suggestions,
    };
}

/**
 * 检查是否为 DejaVu Engine 错误
 */
export function isDejavuError(error: Error): boolean {
    return "structured" in error && (error as any).structured !== undefined;
}

/**
 * 创建错误摘要
 */
export function createErrorSummary(errors: CliError[]): {
    total: number;
    byType: Record<string, number>;
    byFile: Record<string, number>;
    hasFatal: boolean;
} {
    const byType: Record<string, number> = {};
    const byFile: Record<string, number> = {};

    for (const error of errors) {
        byType[error.type] = (byType[error.type] || 0) + 1;
        const file = error.filePath || "<unknown>";
        byFile[file] = (byFile[file] || 0) + 1;
    }

    return {
        total: errors.length,
        byType,
        byFile,
        hasFatal: errors.some((e) => e.severity === "error"),
    };
}
