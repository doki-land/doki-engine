/**
 * Doki Engine CLI 错误格式化工具
 *
 * 提供统一的命令行错误输出格式，支持彩色输出和友好的错误提示。
 */

import chalk from "chalk";
import {
    CliErrorCode,
    ErrorSeverity,
    getErrorCodeMeta,
    formatDescription,
} from "./error-codes.js";

/**
 * CLI 错误类型
 */
export type CliErrorType =
    | "config"
    | "template"
    | "content"
    | "io"
    | "build"
    | "runtime";

/**
 * 源代码位置
 */
export interface SourcePosition {
    line: number;
    column: number;
}

/**
 * 源代码范围
 */
export interface SourceRange {
    start: SourcePosition;
    end: SourcePosition;
}

/**
 * 源代码上下文
 */
export interface SourceContext {
    /** 错误行之前的上下文 */
    before: string[];
    /** 错误行 */
    line: string;
    /** 错误行之后的上下文 */
    after: string[];
    /** 行号 */
    lineNumber: number;
    /** 错误起始列 */
    startColumn: number;
    /** 错误结束列 */
    endColumn: number;
}

/**
 * 修复建议
 */
export interface ErrorSuggestion {
    /** 建议类型 */
    type: "fix" | "alternative" | "reference" | "command";
    /** 建议描述 */
    message: string;
    /** 可执行的命令 */
    command?: string;
    /** 建议的替换文本 */
    replacement?: string;
    /** 文档链接 */
    url?: string;
}

/**
 * CLI 错误信息
 */
export interface CliError {
    /** 错误代码 */
    code?: CliErrorCode;
    /** 错误类型 */
    type: CliErrorType;
    /** 错误标题 */
    title: string;
    /** 详细消息 */
    message: string;
    /** 文件路径 */
    filePath?: string;
    /** 行号 */
    line?: number;
    /** 列号 */
    column?: number;
    /** 源代码范围 */
    range?: SourceRange;
    /** 源代码上下文 */
    sourceContext?: SourceContext;
    /** 源代码行 */
    sourceLine?: string;
    /** 修复建议 */
    suggestions?: ErrorSuggestion[];
    /** 原始错误 */
    cause?: Error;
    /** 严重程度 */
    severity?: ErrorSeverity;
    /** 文档链接 */
    documentationUrl?: string;
    /** 相关错误 */
    relatedErrors?: CliError[];
}

/**
 * 错误类型标签映射
 */
const TYPE_LABELS: Record<CliErrorType, string> = {
    config: "配置错误",
    template: "模板错误",
    content: "内容错误",
    io: "IO 错误",
    build: "构建错误",
    runtime: "运行时错误",
};

/**
 * 严重程度图标映射
 */
const SEVERITY_ICONS: Record<ErrorSeverity, string> = {
    error: "✗",
    warning: "⚠",
    hint: "ℹ",
};

/**
 * 严重程度颜色映射
 */
const SEVERITY_COLORS: Record<ErrorSeverity, (text: string) => string> = {
    error: chalk.red,
    warning: chalk.yellow,
    hint: chalk.blue,
};

/**
 * 严重程度标签映射
 */
export const SEVERITY_LABELS: Record<ErrorSeverity, string> = {
    error: "错误",
    warning: "警告",
    hint: "提示",
};

/**
 * 格式化 CLI 错误为用户友好的输出
 *
 * 输出格式包含：
 * - 错误图标和类型标签（彩色）
 * - 错误标题和描述
 * - 错误代码（格式: [E001]）
 * - 文件位置（格式: 文件:行:列）
 * - 源代码上下文（前后各 2 行，带 ^ 错误指针）
 * - 修复建议列表
 * - 文档链接
 */
export function formatCliError(error: CliError): string {
    const lines: string[] = [];
    const severity = error.severity || "error";
    const icon = SEVERITY_ICONS[severity];
    const colorFn = SEVERITY_COLORS[severity];
    const severityLabel = SEVERITY_LABELS[severity];

    lines.push("");
    lines.push(
        chalk.bold(
            colorFn(`${icon} [${severityLabel}] ${TYPE_LABELS[error.type]}`),
        ),
    );
    lines.push(chalk.gray("─".repeat(50)));

    lines.push(chalk.white.bold(`  ${error.title}`));
    lines.push(chalk.gray(`  ${error.message}`));

    if (error.code) {
        const meta = getErrorCodeMeta(error.code);
        lines.push(
            chalk.gray(`  错误代码: `) +
                chalk.yellow(`[${error.code}]`) +
                (meta?.recoverable ? chalk.gray(" (可恢复)") : ""),
        );
    }

    if (error.filePath) {
        let location = chalk.cyan(error.filePath);
        if (error.line !== undefined) {
            location += chalk.gray(`:${error.line}`);
            if (error.column !== undefined) {
                location += chalk.gray(`:${error.column}`);
            }
        }
        lines.push(chalk.gray(`  位置: `) + location);
    }

    if (error.sourceContext) {
        lines.push("");
        lines.push(chalk.gray("  源代码:"));
        const ctx = error.sourceContext;
        const lineNumWidth = (ctx.lineNumber + ctx.after.length).toString()
            .length;

        for (let i = 0; i < ctx.before.length; i++) {
            const num = (ctx.lineNumber - ctx.before.length + i)
                .toString()
                .padStart(lineNumWidth, " ");
            lines.push(chalk.gray(`  ${num} | `) + chalk.gray(ctx.before[i]));
        }

        const currentNum = ctx.lineNumber
            .toString()
            .padStart(lineNumWidth, " ");
        lines.push(
            chalk.gray(`  ${currentNum} | `) +
                highlightError(ctx.line, ctx.startColumn, ctx.endColumn),
        );

        const pointerIndent = " ".repeat(ctx.startColumn - 1);
        const pointerLength = Math.max(1, ctx.endColumn - ctx.startColumn);
        const pointer = colorFn("^".repeat(pointerLength));
        lines.push(
            chalk.gray("  " + " ".repeat(lineNumWidth) + " | ") +
                pointerIndent +
                pointer +
                chalk.gray(` ${error.title}`),
        );

        for (let i = 0; i < ctx.after.length; i++) {
            const num = (ctx.lineNumber + i + 1)
                .toString()
                .padStart(lineNumWidth, " ");
            lines.push(chalk.gray(`  ${num} | `) + chalk.gray(ctx.after[i]));
        }
    } else if (error.sourceLine && error.column !== undefined) {
        lines.push("");
        lines.push(chalk.gray("  源代码:"));
        const lineNum = error.line?.toString().padStart(4, " ") || "   1";
        lines.push(chalk.gray(`  ${lineNum} | `) + error.sourceLine);
        const pointer = " ".repeat(error.column - 1) + colorFn("^");
        lines.push(
            chalk.gray("      | ") + pointer + chalk.gray(` ${error.title}`),
        );
    }

    if (error.suggestions && error.suggestions.length > 0) {
        lines.push("");
        lines.push(chalk.cyan("  修复建议:"));
        for (const suggestion of error.suggestions) {
            const prefix =
                suggestion.type === "command"
                    ? "→"
                    : suggestion.type === "reference"
                      ? "📖"
                      : "•";
            const msgColor =
                suggestion.type === "command"
                    ? chalk.green
                    : suggestion.type === "reference"
                      ? chalk.blue
                      : chalk.white;
            lines.push(msgColor(`    ${prefix} ${suggestion.message}`));
            if (suggestion.command) {
                lines.push(chalk.gray(`      $ ${suggestion.command}`));
            }
            if (suggestion.replacement) {
                lines.push(
                    chalk.green(`      替换为: ${suggestion.replacement}`),
                );
            }
            if (suggestion.url) {
                lines.push(chalk.gray(`      参考: ${suggestion.url}`));
            }
        }
    }

    if (error.documentationUrl) {
        lines.push("");
        lines.push(chalk.blue(`  📖 文档: ${error.documentationUrl}`));
    }

    if (error.relatedErrors && error.relatedErrors.length > 0) {
        lines.push("");
        lines.push(chalk.gray(`  相关错误: ${error.relatedErrors.length} 个`));
    }

    lines.push("");
    return lines.join("\n");
}

/**
 * 高亮错误位置
 */
function highlightError(
    line: string,
    startColumn: number,
    endColumn: number,
): string {
    const before = line.slice(0, startColumn - 1);
    const error = line.slice(startColumn - 1, endColumn);
    const after = line.slice(endColumn);

    return chalk.gray(before) + chalk.red.bold(error) + chalk.gray(after);
}

/**
 * 打印 CLI 错误到控制台
 */
export function printCliError(error: CliError): void {
    console.error(formatCliError(error));
}

/**
 * 打印成功消息
 */
export function printSuccess(message: string): void {
    console.log(chalk.green(`✓ ${message}`));
}

/**
 * 打印警告消息
 */
export function printWarning(message: string): void {
    console.log(chalk.yellow(`⚠ ${message}`));
}

/**
 * 打印信息消息
 */
export function printInfo(message: string): void {
    console.log(chalk.blue(`ℹ ${message}`));
}

/**
 * 打印构建进度
 */
export function printProgress(step: string, detail?: string): void {
    const text = detail ? `${step}: ${detail}` : step;
    console.log(chalk.gray(`  → ${text}`));
}

/**
 * 创建 CLI 错误
 */
export function createCliError(
    code: CliErrorCode,
    type: CliErrorType,
    params: Record<string, string> = {},
    options: Partial<Omit<CliError, "code" | "type">> = {},
): CliError {
    const meta = getErrorCodeMeta(code);
    const message = formatDescription(code, params);

    return {
        code,
        type,
        title: options.title || meta?.title || "未知错误",
        message: options.message || message,
        severity: options.severity || meta?.severity || "error",
        documentationUrl: options.documentationUrl || meta?.documentationUrl,
        ...options,
    };
}

/**
 * 创建配置文件未找到错误
 */
export function configNotFoundError(configPath: string): CliError {
    return createCliError(
        CliErrorCode.CONFIG_NOT_FOUND,
        "config",
        { path: configPath },
        {
            filePath: configPath,
            title: "配置文件未找到",
            suggestions: [
                {
                    type: "command",
                    message: "运行 doki init 初始化新项目",
                    command: "doki init",
                },
                { type: "fix", message: "检查是否在项目根目录运行命令" },
                { type: "fix", message: "确保配置文件名为 doki.toml" },
                {
                    type: "fix",
                    message: "如果配置文件在其他位置，使用 --config 指定路径",
                },
                {
                    type: "reference",
                    message: "配置文件文档",
                    url: "https://docs.doki.engine/config",
                },
            ],
        },
    );
}

/**
 * 创建配置解析错误
 */
export function configParseError(configPath: string, detail: string): CliError {
    return createCliError(
        CliErrorCode.CONFIG_PARSE_ERROR,
        "config",
        { detail },
        {
            filePath: configPath,
            suggestions: [
                { type: "fix", message: "检查配置文件格式是否正确" },
                { type: "fix", message: "确保 TOML 语法有效" },
                {
                    type: "reference",
                    message: "配置文件文档",
                    url: "https://docs.doki.engine/config",
                },
            ],
        },
    );
}

/**
 * 创建模板解析错误
 *
 * 从 DejaVu Engine 错误中提取结构化信息，包括：
 * - 错误代码
 * - 错误位置（行、列）
 * - 源代码上下文
 * - 修复建议
 */
export function templateParseError(filePath: string, error: Error): CliError {
    const structured = "structured" in error ? (error as any).structured : null;

    const suggestions: ErrorSuggestion[] = structured?.suggestions?.map(
        (s: any) => ({
            type: "fix" as const,
            message: s.message,
            replacement: s.replacement,
        }),
    ) || [
        { type: "fix", message: "检查模板语法是否正确" },
        { type: "fix", message: "确保所有标签都已正确闭合" },
        { type: "fix", message: "检查变量名是否正确拼写" },
        {
            type: "reference",
            message: "模板语法文档",
            url: "https://docs.doki.engine/templates/syntax",
        },
    ];

    const errorCode = structured?.code || CliErrorCode.UNEXPECTED_TOKEN;
    const errorMessage = structured?.message || error.message;
    const line = structured?.range?.start?.line;
    const column = structured?.range?.start?.column;
    const endColumn = structured?.range?.end?.column;

    let sourceContext: SourceContext | undefined;
    if (structured?.sourceLine && line !== undefined && column !== undefined) {
        sourceContext = {
            before: structured.before || [],
            line: structured.sourceLine,
            after: structured.after || [],
            lineNumber: line,
            startColumn: column,
            endColumn: endColumn || column + 1,
        };
    }

    return createCliError(
        errorCode,
        "template",
        {},
        {
            title: "模板解析失败",
            message: errorMessage,
            filePath,
            line,
            column,
            sourceContext,
            sourceLine: structured?.sourceLine,
            range: structured?.range,
            suggestions,
            cause: error,
        },
    );
}

/**
 * 创建模板加载错误
 */
export function templateLoadError(
    templateName: string,
    detail: string,
): CliError {
    return createCliError(
        CliErrorCode.TEMPLATE_LOAD_ERROR,
        "template",
        { name: templateName, detail },
        {
            suggestions: [
                {
                    type: "fix",
                    message: `检查模板文件 ${templateName} 是否存在`,
                },
                { type: "fix", message: "检查模板目录配置是否正确" },
            ],
        },
    );
}

/**
 * 创建内容处理错误
 */
export function contentProcessError(filePath: string, error: Error): CliError {
    return createCliError(
        CliErrorCode.CONTENT_PARSE_ERROR,
        "content",
        { path: filePath, detail: error.message },
        {
            filePath,
            suggestions: [
                { type: "fix", message: "检查文件格式是否正确" },
                { type: "fix", message: "确保 frontmatter 格式有效" },
                { type: "fix", message: "检查文件编码是否为 UTF-8" },
            ],
            cause: error,
        },
    );
}

/**
 * 创建 Frontmatter 错误
 */
export function frontmatterError(filePath: string, detail: string): CliError {
    return createCliError(
        CliErrorCode.FRONTMATTER_ERROR,
        "content",
        { path: filePath, detail },
        {
            filePath,
            suggestions: [
                { type: "fix", message: "确保 frontmatter 使用 --- 分隔符" },
                { type: "fix", message: "检查 YAML 语法是否正确" },
                {
                    type: "reference",
                    message: "Frontmatter 文档",
                    url: "https://docs.doki.engine/content/frontmatter",
                },
            ],
        },
    );
}

/**
 * 创建输出目录错误
 */
export function outputDirError(outputDir: string, error: Error): CliError {
    return createCliError(
        CliErrorCode.FILE_WRITE_ERROR,
        "io",
        { path: outputDir, detail: error.message },
        {
            filePath: outputDir,
            suggestions: [
                { type: "fix", message: "检查输出目录权限" },
                { type: "fix", message: "确保磁盘空间充足" },
                { type: "fix", message: "检查是否有其他进程占用目录" },
            ],
            cause: error,
        },
    );
}

/**
 * 创建文件未找到错误
 */
export function fileNotFoundError(filePath: string): CliError {
    return createCliError(
        CliErrorCode.FILE_NOT_FOUND,
        "io",
        { path: filePath },
        {
            filePath,
            suggestions: [
                { type: "fix", message: "检查文件路径是否正确" },
                { type: "fix", message: "确保文件存在" },
            ],
        },
    );
}

/**
 * 创建目录错误
 */
export function directoryError(dirPath: string, detail: string): CliError {
    return createCliError(
        CliErrorCode.DIRECTORY_ERROR,
        "io",
        { path: dirPath, detail },
        {
            filePath: dirPath,
            suggestions: [
                { type: "fix", message: "检查目录路径是否正确" },
                { type: "fix", message: "确保有创建目录的权限" },
            ],
        },
    );
}

/**
 * 创建构建错误
 */
export function buildError(errors: string[]): CliError {
    return createCliError(
        CliErrorCode.BUILD_FAILED,
        "build",
        { detail: `构建过程中发生 ${errors.length} 个错误` },
        {
            suggestions: errors.slice(0, 3).map((msg) => ({
                type: "fix" as const,
                message: msg,
            })),
        },
    );
}

/**
 * 创建渲染错误
 */
export function renderError(filePath: string, detail: string): CliError {
    return createCliError(
        CliErrorCode.RENDER_ERROR,
        "build",
        { path: filePath, detail },
        {
            filePath,
            suggestions: [
                { type: "fix", message: "检查模板变量是否正确" },
                { type: "fix", message: "确保所有依赖的模板都已加载" },
            ],
        },
    );
}

/**
 * 创建服务器启动错误
 */
export function serverStartError(detail: string): CliError {
    return createCliError(
        CliErrorCode.SERVER_START_ERROR,
        "runtime",
        { detail },
        {
            suggestions: [
                { type: "fix", message: "检查端口是否被占用" },
                { type: "fix", message: "确保有足够的系统资源" },
            ],
        },
    );
}

/**
 * 创建端口占用错误
 */
export function portInUseError(port: number): CliError {
    return createCliError(
        CliErrorCode.PORT_IN_USE,
        "runtime",
        { port: port.toString() },
        {
            title: "端口已被占用",
            suggestions: [
                {
                    type: "command",
                    message: `使用其他端口启动开发服务器`,
                    command: `doki dev -p ${port + 1}`,
                },
                {
                    type: "command",
                    message: `查找占用端口 ${port} 的进程`,
                    command: `netstat -ano | findstr :${port}`,
                },
                { type: "fix", message: `终止占用端口的进程后重试` },
                {
                    type: "reference",
                    message: "开发服务器文档",
                    url: "https://docs.doki.engine/cli/dev",
                },
            ],
        },
    );
}

/**
 * 创建浏览器打开错误
 */
export function browserOpenError(detail: string): CliError {
    return createCliError(
        CliErrorCode.BROWSER_OPEN_ERROR,
        "runtime",
        { detail },
        {
            severity: "warning",
            suggestions: [
                { type: "fix", message: "手动打开浏览器访问显示的 URL" },
            ],
        },
    );
}

/**
 * 错误处理装饰器
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    errorType: CliErrorType,
): T {
    return (async (...args: Parameters<T>) => {
        try {
            return await fn(...args);
        } catch (error) {
            const cliError: CliError = {
                type: errorType,
                title: "操作失败",
                message: (error as Error).message,
                cause: error as Error,
            };
            printCliError(cliError);
            process.exit(1);
        }
    }) as T;
}

/**
 * 批量错误报告
 */
export interface ErrorReport {
    /** 错误总数 */
    total: number;
    /** 按类型分组的错误 */
    byType: Record<CliErrorType, CliError[]>;
    /** 是否有致命错误 */
    hasFatal: boolean;
}

/**
 * 创建错误报告
 */
export function createErrorReport(errors: CliError[]): ErrorReport {
    const byType: Record<CliErrorType, CliError[]> = {
        config: [],
        template: [],
        content: [],
        io: [],
        build: [],
        runtime: [],
    };

    for (const error of errors) {
        byType[error.type].push(error);
    }

    return {
        total: errors.length,
        byType,
        hasFatal: errors.some((e) => e.severity === "error"),
    };
}

/**
 * 打印错误报告摘要
 */
export function printErrorReportSummary(report: ErrorReport): void {
    console.log("");
    console.log(chalk.red("构建失败"));
    console.log(chalk.gray("─".repeat(40)));

    for (const [type, errors] of Object.entries(report.byType)) {
        if (errors.length > 0) {
            console.log(
                chalk.red(
                    `  ${TYPE_LABELS[type as CliErrorType]}: ${errors.length} 个错误`,
                ),
            );
        }
    }

    console.log(chalk.gray("─".repeat(40)));
    console.log(chalk.red(`  总计: ${report.total} 个错误`));
    console.log("");
}

/**
 * 从源代码提取上下文
 */
export function extractSourceContext(
    source: string,
    line: number,
    column: number,
    endColumn?: number,
    contextLines: number = 2,
): SourceContext {
    const lines = source.split("\n");
    const targetLine = lines[line - 1] || "";

    const before: string[] = [];
    for (let i = Math.max(0, line - 1 - contextLines); i < line - 1; i++) {
        before.push(lines[i] || "");
    }

    const after: string[] = [];
    for (let i = line; i < Math.min(lines.length, line + contextLines); i++) {
        after.push(lines[i] || "");
    }

    return {
        before,
        line: targetLine,
        after,
        lineNumber: line,
        startColumn: column,
        endColumn: endColumn || column + 1,
    };
}
