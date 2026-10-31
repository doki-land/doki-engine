import {
    DEJAVU_LANGUAGE,
    DOKI_LANGUAGE,
    DokiEngine,
} from "@doki-land/doki-engine";
import * as vscode from "vscode";
import {
    LanguageClient,
    type LanguageClientOptions,
    type ServerOptions,
    TransportKind,
} from "vscode-languageclient/node";
import {
    DokiCompletionProvider,
    DokiSignatureHelpProvider,
} from "./completion";
import {
    createDiagnosticsProvider,
    registerCodeActionProvider,
    registerFixAllCommand,
} from "./diagnostics";
import { PreviewProvider } from "./preview";

let client: LanguageClient | undefined;

/**
 * 定界符配置接口
 */
export interface DelimitersConfig {
    /**
     * 代码块开始定界符
     */
    codeStart: string;

    /**
     * 代码块结束定界符
     */
    codeEnd: string;

    /**
     * 注释块开始定界符
     */
    commentStart: string;

    /**
     * 注释块结束定界符
     */
    commentEnd: string;
}

/**
 * 构建配置接口
 */
export interface BuildConfig {
    /**
     * 输出目录
     */
    outputDir: string;

    /**
     * 忽略文件列表
     */
    ignoreFiles: string[];
}

/**
 * Doki 配置接口
 */
export interface DokiConfig {
    /**
     * 定界符配置
     */
    delimiters: DelimitersConfig;

    /**
     * 构建配置
     */
    build: BuildConfig;
}

/**
 * 配置管理器类，负责读取和管理 VSCode 设置
 */
export class ConfigManager {
    /**
     * 配置节名称
     */
    private static readonly CONFIG_SECTION = "doki";

    /**
     * 获取完整的 Doki 配置
     * @returns Doki 配置对象
     */
    public static getConfig(): DokiConfig {
        return {
            delimiters: ConfigManager.getDelimitersConfig(),
            build: ConfigManager.getBuildConfig(),
        };
    }

    /**
     * 获取定界符配置
     * @returns 定界符配置对象
     */
    public static getDelimitersConfig(): DelimitersConfig {
        const config = vscode.workspace.getConfiguration(
            ConfigManager.CONFIG_SECTION,
        );

        return {
            codeStart: config.get<string>(
                "template.delimiters.codeStart",
                "{%",
            ),
            codeEnd: config.get<string>("template.delimiters.codeEnd", "%}"),
            commentStart: config.get<string>(
                "template.delimiters.commentStart",
                "{#",
            ),
            commentEnd: config.get<string>(
                "template.delimiters.commentEnd",
                "#}",
            ),
        };
    }

    /**
     * 获取构建配置
     * @returns 构建配置对象
     */
    public static getBuildConfig(): BuildConfig {
        const config = vscode.workspace.getConfiguration(
            ConfigManager.CONFIG_SECTION,
        );

        return {
            outputDir: config.get<string>("build.outputDir", "dist"),
            ignoreFiles: config.get<string[]>("build.ignoreFiles", []),
        };
    }

    /**
     * 获取代码块开始定界符
     * @returns 代码块开始定界符
     */
    public static getCodeStartDelimiter(): string {
        const config = vscode.workspace.getConfiguration(
            ConfigManager.CONFIG_SECTION,
        );
        return config.get<string>("template.delimiters.codeStart", "{%");
    }

    /**
     * 获取代码块结束定界符
     * @returns 代码块结束定界符
     */
    public static getCodeEndDelimiter(): string {
        const config = vscode.workspace.getConfiguration(
            ConfigManager.CONFIG_SECTION,
        );
        return config.get<string>("template.delimiters.codeEnd", "%}");
    }

    /**
     * 获取注释块开始定界符
     * @returns 注释块开始定界符
     */
    public static getCommentStartDelimiter(): string {
        const config = vscode.workspace.getConfiguration(
            ConfigManager.CONFIG_SECTION,
        );
        return config.get<string>("template.delimiters.commentStart", "{#");
    }

    /**
     * 获取注释块结束定界符
     * @returns 注释块结束定界符
     */
    public static getCommentEndDelimiter(): string {
        const config = vscode.workspace.getConfiguration(
            ConfigManager.CONFIG_SECTION,
        );
        return config.get<string>("template.delimiters.commentEnd", "#}");
    }

    /**
     * 获取输出目录
     * @returns 输出目录路径
     */
    public static getOutputDir(): string {
        const config = vscode.workspace.getConfiguration(
            ConfigManager.CONFIG_SECTION,
        );
        return config.get<string>("build.outputDir", "dist");
    }

    /**
     * 获取忽略文件列表
     * @returns 忽略文件列表
     */
    public static getIgnoreFiles(): string[] {
        const config = vscode.workspace.getConfiguration(
            ConfigManager.CONFIG_SECTION,
        );
        return config.get<string[]>("build.ignoreFiles", []);
    }
}

/**
 * 文档链接基础 URL
 */
const DOCS_BASE_URL = "https://docs.doki.engine/errors";

/**
 * 错误代码枚举
 */
enum ErrorCode {
    SyntaxError = "E001",
    DelimiterMismatch = "E002",
    UndefinedVariable = "E003",
    UndefinedFunction = "E004",
    TypeMismatch = "E005",
    InvalidExpression = "E006",
    UnexpectedToken = "E007",
    MissingToken = "E008",
    DuplicateDeclaration = "E009",
    ScopeError = "E010",
}

/**
 * 错误严重程度类型
 */
enum ErrorSeverity {
    Error = "Error",
    Warning = "Warning",
    Hint = "Hint",
}

/**
 * 错误代码配置接口
 */
interface ErrorCodeConfig {
    code: ErrorCode;
    title: string;
    description: string;
    severity: ErrorSeverity;
    fixSuggestion: string;
    documentationUrl: string;
}

/**
 * 错误代码配置映射
 */
const ERROR_CONFIGS: Record<ErrorCode, ErrorCodeConfig> = {
    [ErrorCode.SyntaxError]: {
        code: ErrorCode.SyntaxError,
        title: "语法错误",
        description: "模板语法不符合规范，无法正确解析",
        severity: ErrorSeverity.Error,
        fixSuggestion: "请检查语法是否正确，确保所有语句都已正确闭合",
        documentationUrl: `${DOCS_BASE_URL}/E001`,
    },
    [ErrorCode.DelimiterMismatch]: {
        code: ErrorCode.DelimiterMismatch,
        title: "定界符不匹配",
        description: "开始定界符和结束定界符数量不匹配",
        severity: ErrorSeverity.Error,
        fixSuggestion: "确保每个开始定界符都有对应的结束定界符",
        documentationUrl: `${DOCS_BASE_URL}/E002`,
    },
    [ErrorCode.UndefinedVariable]: {
        code: ErrorCode.UndefinedVariable,
        title: "未定义的变量",
        description: "使用了未声明的变量",
        severity: ErrorSeverity.Error,
        fixSuggestion: "在使用变量前，请先使用 let 关键字声明变量",
        documentationUrl: `${DOCS_BASE_URL}/E003`,
    },
    [ErrorCode.UndefinedFunction]: {
        code: ErrorCode.UndefinedFunction,
        title: "未定义的函数",
        description: "调用了未声明的函数",
        severity: ErrorSeverity.Error,
        fixSuggestion: "请确保函数已正确定义，或检查函数名称是否正确",
        documentationUrl: `${DOCS_BASE_URL}/E004`,
    },
    [ErrorCode.TypeMismatch]: {
        code: ErrorCode.TypeMismatch,
        title: "类型不匹配",
        description: "操作数的类型不兼容",
        severity: ErrorSeverity.Warning,
        fixSuggestion: "请检查操作数的类型是否兼容",
        documentationUrl: `${DOCS_BASE_URL}/E005`,
    },
    [ErrorCode.InvalidExpression]: {
        code: ErrorCode.InvalidExpression,
        title: "无效的表达式",
        description: "表达式语法不正确",
        severity: ErrorSeverity.Error,
        fixSuggestion: "请检查表达式语法是否正确",
        documentationUrl: `${DOCS_BASE_URL}/E006`,
    },
    [ErrorCode.UnexpectedToken]: {
        code: ErrorCode.UnexpectedToken,
        title: "意外的标记",
        description: "遇到了不应该出现的标记",
        severity: ErrorSeverity.Error,
        fixSuggestion: "请检查是否有多余的字符或缺少必要的符号",
        documentationUrl: `${DOCS_BASE_URL}/E007`,
    },
    [ErrorCode.MissingToken]: {
        code: ErrorCode.MissingToken,
        title: "缺少必要的标记",
        description: "缺少必要的语法元素",
        severity: ErrorSeverity.Error,
        fixSuggestion: "请检查是否缺少必要的语法元素",
        documentationUrl: `${DOCS_BASE_URL}/E008`,
    },
    [ErrorCode.DuplicateDeclaration]: {
        code: ErrorCode.DuplicateDeclaration,
        title: "重复的声明",
        description: "变量或函数已在当前作用域中声明",
        severity: ErrorSeverity.Warning,
        fixSuggestion: "请使用不同的名称或删除重复的声明",
        documentationUrl: `${DOCS_BASE_URL}/E009`,
    },
    [ErrorCode.ScopeError]: {
        code: ErrorCode.ScopeError,
        title: "作用域错误",
        description: "变量或函数不在当前可访问的作用域内",
        severity: ErrorSeverity.Error,
        fixSuggestion: "请检查变量或函数的作用域范围",
        documentationUrl: `${DOCS_BASE_URL}/E010`,
    },
};

/**
 * 生成错误文档链接
 * @param errorCode 错误代码
 * @returns 文档链接 URL
 */
function _generateDocumentationUrl(errorCode: ErrorCode): string {
    return `${DOCS_BASE_URL}/${errorCode}`;
}

/**
 * 根据错误消息推断错误代码
 * @param message 错误消息
 * @returns 推断的错误代码
 */
function inferErrorCode(message: string): ErrorCode {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes("语法") || lowerMessage.includes("syntax")) {
        return ErrorCode.SyntaxError;
    }
    if (lowerMessage.includes("定界符") || lowerMessage.includes("delimiter")) {
        return ErrorCode.DelimiterMismatch;
    }
    if (lowerMessage.includes("未定义") || lowerMessage.includes("undefined")) {
        if (
            lowerMessage.includes("函数") ||
            lowerMessage.includes("function")
        ) {
            return ErrorCode.UndefinedFunction;
        }
        return ErrorCode.UndefinedVariable;
    }
    if (lowerMessage.includes("类型") || lowerMessage.includes("type")) {
        return ErrorCode.TypeMismatch;
    }
    if (lowerMessage.includes("意外") || lowerMessage.includes("unexpected")) {
        return ErrorCode.UnexpectedToken;
    }
    if (lowerMessage.includes("缺少") || lowerMessage.includes("missing")) {
        return ErrorCode.MissingToken;
    }
    if (lowerMessage.includes("重复") || lowerMessage.includes("duplicate")) {
        return ErrorCode.DuplicateDeclaration;
    }
    if (lowerMessage.includes("作用域") || lowerMessage.includes("scope")) {
        return ErrorCode.ScopeError;
    }
    if (
        lowerMessage.includes("表达式") ||
        lowerMessage.includes("expression")
    ) {
        return ErrorCode.InvalidExpression;
    }

    return ErrorCode.SyntaxError;
}

/**
 * 错误管理器，负责管理错误输出通道和状态栏
 */
class ErrorManager {
    private outputChannel: vscode.OutputChannel;
    private statusBarItem: vscode.StatusBarItem;
    private errorCount: number = 0;
    private warningCount: number = 0;
    private errors: ErrorInfo[] = [];
    private treeDataProvider: ErrorTreeDataProvider;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel("Doki Engine");
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100,
        );
        this.statusBarItem.command = "doki.showErrors";
        this.statusBarItem.hide();
        this.treeDataProvider = new ErrorTreeDataProvider();
    }

    /**
     * 清除所有错误
     */
    clearErrors(): void {
        this.errorCount = 0;
        this.warningCount = 0;
        this.errors = [];
        this.statusBarItem.hide();
        this.outputChannel.clear();
        this.treeDataProvider.refresh([]);
    }

    /**
     * 添加错误
     */
    addError(error: ErrorInfo): void {
        this.errors.push(error);
        if (error.severity === ErrorSeverity.Error) {
            this.errorCount++;
        } else if (error.severity === ErrorSeverity.Warning) {
            this.warningCount++;
        }
        this.updateStatusBar();
        this.logError(error);
        this.treeDataProvider.refresh(this.errors);
    }

    /**
     * 设置加载状态
     */
    setLoading(isLoading: boolean): void {
        if (isLoading) {
            this.statusBarItem.text = "$(sync~spin) 编译中...";
            this.statusBarItem.tooltip = "正在编译模板";
            this.statusBarItem.show();
        } else if (this.errorCount > 0 || this.warningCount > 0) {
            this.updateStatusBar();
        } else {
            this.statusBarItem.hide();
        }
    }

    /**
     * 更新状态栏
     */
    private updateStatusBar(): void {
        const parts: string[] = [];
        if (this.errorCount > 0) {
            parts.push(`$(error) ${this.errorCount}`);
        }
        if (this.warningCount > 0) {
            parts.push(`$(warning) ${this.warningCount}`);
        }

        if (parts.length > 0) {
            this.statusBarItem.text = parts.join(" ");
            this.statusBarItem.tooltip = `${this.errorCount} 个错误, ${this.warningCount} 个警告\n点击查看详情`;
            this.statusBarItem.show();
        } else {
            this.statusBarItem.hide();
        }
    }

    /**
     * 记录错误到输出通道
     */
    private logError(error: ErrorInfo): void {
        const config = ERROR_CONFIGS[error.code];
        const severityIcon = this.getSeverityIcon(error.severity);

        this.outputChannel.appendLine("");
        this.outputChannel.appendLine("═".repeat(70));
        this.outputChannel.appendLine(
            `${severityIcon} [${error.code}] ${error.title}`,
        );
        this.outputChannel.appendLine("─".repeat(70));
        this.outputChannel.appendLine(`  严重程度: ${error.severity}`);
        this.outputChannel.appendLine(`  位置: ${error.location}`);
        this.outputChannel.appendLine(
            `  描述: ${config?.description || error.message}`,
        );

        if (error.fileUri) {
            this.outputChannel.appendLine(`  文件链接: ${error.fileUri}`);
        }

        if (error.line !== undefined) {
            this.outputChannel.appendLine(
                `  行号: ${error.line}${error.column !== undefined ? `, 列号: ${error.column}` : ""}`,
            );
        }

        this.outputChannel.appendLine("");
        this.outputChannel.appendLine("  📖 修复建议:");
        this.outputChannel.appendLine(`     ${error.fixSuggestion}`);

        if (error.suggestions && error.suggestions.length > 0) {
            this.outputChannel.appendLine("");
            this.outputChannel.appendLine("  💡 更多建议:");
            for (const suggestion of error.suggestions) {
                this.outputChannel.appendLine(`     • ${suggestion}`);
            }
        }

        this.outputChannel.appendLine("");
        this.outputChannel.appendLine(
            `  🔗 文档链接: ${error.documentationUrl}`,
        );

        if (error.stack) {
            this.outputChannel.appendLine("");
            this.outputChannel.appendLine("  📋 堆栈跟踪:");
            const stackLines = error.stack.split("\n");
            for (const line of stackLines) {
                this.outputChannel.appendLine(`     ${line}`);
            }
        }
        this.outputChannel.appendLine("═".repeat(70));
    }

    /**
     * 获取严重程度图标
     * @param severity 严重程度
     * @returns 图标字符串
     */
    private getSeverityIcon(severity: ErrorSeverity): string {
        switch (severity) {
            case ErrorSeverity.Error:
                return "❌";
            case ErrorSeverity.Warning:
                return "⚠️";
            case ErrorSeverity.Hint:
                return "💡";
            default:
                return "❓";
        }
    }

    /**
     * 显示输出通道
     */
    showOutput(): void {
        this.outputChannel.show();
    }

    /**
     * 获取所有错误
     */
    getErrors(): ErrorInfo[] {
        return this.errors;
    }

    /**
     * 获取格式化的错误文本
     */
    getFormattedErrors(): string {
        return this.errors
            .map((e, i) => {
                const config = ERROR_CONFIGS[e.code];
                return [
                    `${i + 1}. [${e.code}] ${e.title}`,
                    `   严重程度: ${e.severity}`,
                    `   位置: ${e.location}`,
                    `   描述: ${config?.description || e.message}`,
                    `   修复建议: ${e.fixSuggestion}`,
                    `   文档: ${e.documentationUrl}`,
                ].join("\n");
            })
            .join("\n\n");
    }

    /**
     * 获取树数据提供器
     */
    getTreeDataProvider(): ErrorTreeDataProvider {
        return this.treeDataProvider;
    }

    /**
     * 释放资源
     */
    dispose(): void {
        this.outputChannel.dispose();
        this.statusBarItem.dispose();
    }
}

/**
 * 错误信息接口
 */
interface ErrorInfo {
    title: string;
    code: ErrorCode;
    message: string;
    location: string;
    fileUri?: string;
    stack?: string;
    documentationUrl: string;
    fixSuggestion: string;
    severity: ErrorSeverity;
    line?: number;
    column?: number;
    suggestions?: string[];
}

/**
 * 错误树节点
 */
class ErrorTreeItem extends vscode.TreeItem {
    constructor(
        public readonly error: ErrorInfo,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    ) {
        super(error.title, collapsibleState);

        const icon =
            error.severity === ErrorSeverity.Error
                ? "error"
                : error.severity === ErrorSeverity.Warning
                  ? "warning"
                  : "info";
        this.iconPath = new vscode.ThemeIcon(icon);
        this.description = `[${error.code}] ${error.location.split("/").pop()}`;
        this.tooltip = `${error.title}\n${error.location}\n${error.message}\n\n修复建议: ${error.fixSuggestion}`;
        this.contextValue =
            error.severity === ErrorSeverity.Error ? "error" : "warning";

        if (error.fileUri && error.line !== undefined) {
            this.command = {
                command: "doki.goToError",
                title: "跳转到错误",
                arguments: [error.fileUri, error.line, error.column || 1],
            };
        }
    }
}

/**
 * 错误树数据提供器
 */
class ErrorTreeDataProvider implements vscode.TreeDataProvider<ErrorTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<
        ErrorTreeItem | undefined | null | undefined
    > = new vscode.EventEmitter<ErrorTreeItem | undefined | null | undefined>();
    readonly onDidChangeTreeData: vscode.Event<
        ErrorTreeItem | undefined | null | undefined
    > = this._onDidChangeTreeData.event;

    private errors: ErrorInfo[] = [];

    refresh(errors: ErrorInfo[]): void {
        this.errors = errors;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ErrorTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ErrorTreeItem): Thenable<ErrorTreeItem[]> {
        if (!element) {
            return Promise.resolve(
                this.errors.map(
                    (e) =>
                        new ErrorTreeItem(
                            e,
                            vscode.TreeItemCollapsibleState.None,
                        ),
                ),
            );
        }
        return Promise.resolve([]);
    }
}

/**
 * 解析错误信息，提取位置信息
 * @param error 错误对象
 * @param document 文档对象
 * @returns 错误信息对象
 */
function parseError(error: unknown, document: vscode.TextDocument): ErrorInfo {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    const errorCode = inferErrorCode(errorMessage);
    const config = ERROR_CONFIGS[errorCode];

    const lineMatch =
        errorMessage.match(/line\s*(\d+)/i) ||
        errorMessage.match(/:(\d+):(\d+)/);
    const colMatch =
        errorMessage.match(/column\s*(\d+)/i) ||
        errorMessage.match(/:(\d+):(\d+)/);

    let location = `${document.fileName}`;
    let fileUri: string | undefined;
    let line: number | undefined;
    let column: number | undefined;

    if (lineMatch) {
        line = parseInt(lineMatch[1], 10);
        column = colMatch ? parseInt(colMatch[2] || colMatch[1], 10) : 1;
        location = `${document.fileName}:${line}:${column}`;
        fileUri = `${document.uri.toString()}#${line},${column}`;
    } else {
        fileUri = document.uri.toString();
    }

    const titleMatch = errorMessage.match(/^([^[]+)/);
    const title = titleMatch ? titleMatch[1].trim() : config.title;

    const suggestions = generateSuggestions(errorCode, errorMessage);

    return {
        title: `${title}`,
        code: errorCode,
        message: errorMessage,
        location,
        fileUri,
        stack: errorStack,
        documentationUrl: config.documentationUrl,
        fixSuggestion: config.fixSuggestion,
        severity: config.severity,
        line,
        column,
        suggestions,
    };
}

/**
 * 根据错误代码生成建议
 * @param errorCode 错误代码
 * @param message 错误消息
 * @returns 建议列表
 */
function generateSuggestions(errorCode: ErrorCode, message: string): string[] {
    const suggestions: string[] = [];

    switch (errorCode) {
        case ErrorCode.SyntaxError:
            suggestions.push("检查所有语句块是否正确闭合");
            suggestions.push("确认定界符使用正确");
            break;
        case ErrorCode.DelimiterMismatch:
            suggestions.push("检查开始和结束定界符数量是否匹配");
            suggestions.push("确认没有遗漏或多余的定界符");
            break;
        case ErrorCode.UndefinedVariable: {
            const varMatch = message.match(/变量\s+(\w+)/);
            if (varMatch) {
                suggestions.push(`使用 let ${varMatch[1]} = value 声明变量`);
            }
            suggestions.push("检查变量名是否拼写正确");
            break;
        }
        case ErrorCode.UndefinedFunction: {
            const funcMatch = message.match(/函数\s+(\w+)/);
            if (funcMatch) {
                suggestions.push(`使用 micro ${funcMatch[1]}() 定义函数`);
            }
            suggestions.push("检查函数名是否拼写正确");
            break;
        }
        case ErrorCode.TypeMismatch:
            suggestions.push("使用类型转换函数进行转换");
            suggestions.push("检查操作数类型是否兼容");
            break;
        case ErrorCode.UnexpectedToken:
            suggestions.push("删除多余的字符");
            suggestions.push("检查是否遗漏了必要的符号");
            break;
        case ErrorCode.MissingToken:
            suggestions.push("添加缺少的语法元素");
            break;
        default:
            break;
    }

    return suggestions;
}

/**
 * 显示友好的错误对话框
 * @param errorInfo 错误信息
 * @param errorManager 错误管理器
 */
async function showFriendlyErrorDialog(
    errorInfo: ErrorInfo,
    errorManager: ErrorManager,
): Promise<void> {
    const actions = ["查看详情", "查看文档", "复制错误", "关闭"];

    const selection = await vscode.window.showErrorMessage(
        `编译失败: [${errorInfo.code}] ${errorInfo.title}`,
        ...actions,
    );

    switch (selection) {
        case "查看详情":
            errorManager.showOutput();
            break;
        case "查看文档":
            vscode.env.openExternal(
                vscode.Uri.parse(errorInfo.documentationUrl),
            );
            break;
        case "复制错误":
            await vscode.env.clipboard.writeText(
                [
                    `错误: [${errorInfo.code}] ${errorInfo.title}`,
                    `严重程度: ${errorInfo.severity}`,
                    `位置: ${errorInfo.location}`,
                    `描述: ${errorInfo.message}`,
                    `修复建议: ${errorInfo.fixSuggestion}`,
                    `文档: ${errorInfo.documentationUrl}`,
                ].join("\n"),
            );
            vscode.window.showInformationMessage("错误信息已复制到剪贴板");
            break;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log("Doki VSCode extension is now active!");

    const engine = new DokiEngine();
    const errorManager = new ErrorManager();

    const treeView = vscode.window.createTreeView("dokiErrors", {
        treeDataProvider: errorManager.getTreeDataProvider(),
        showCollapseAll: false,
    });

    const showErrorsCommand = vscode.commands.registerCommand(
        "doki.showErrors",
        () => {
            errorManager.showOutput();
        },
    );

    const clearErrorsCommand = vscode.commands.registerCommand(
        "doki.clearErrors",
        () => {
            errorManager.clearErrors();
            vscode.window.showInformationMessage("已清除所有错误");
        },
    );

    const copyErrorCommand = vscode.commands.registerCommand(
        "doki.copyError",
        async (item: ErrorTreeItem) => {
            const error = item.error;
            await vscode.env.clipboard.writeText(
                [
                    `错误: [${error.code}] ${error.title}`,
                    `严重程度: ${error.severity}`,
                    `位置: ${error.location}`,
                    `描述: ${error.message}`,
                    `修复建议: ${error.fixSuggestion}`,
                    `文档: ${error.documentationUrl}`,
                ].join("\n"),
            );
            vscode.window.showInformationMessage("错误信息已复制到剪贴板");
        },
    );

    const viewErrorDocsCommand = vscode.commands.registerCommand(
        "doki.viewErrorDocs",
        (item: ErrorTreeItem) => {
            vscode.env.openExternal(
                vscode.Uri.parse(item.error.documentationUrl),
            );
        },
    );

    const compileTemplateCommand = vscode.commands.registerCommand(
        "doki.compileTemplate",
        async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showErrorMessage("未找到活动的编辑器");
                return;
            }

            const document = activeEditor.document;
            const fileName = document.fileName;
            const extension = fileName.split(".").pop()?.toLowerCase();

            if (
                extension !== "dj" &&
                extension !== "doki" &&
                extension !== "dejavu"
            ) {
                vscode.window.showErrorMessage(
                    "当前文件不是 Doki 模板 (.dj, .doki, .dejavu)",
                );
                return;
            }

            errorManager.clearErrors();
            errorManager.setLoading(true);

            try {
                const templateContent = document.getText();
                const language =
                    extension === "dejavu" ? DEJAVU_LANGUAGE : DOKI_LANGUAGE;
                const compiled = engine.renderTemplateOnce(
                    templateContent,
                    {},
                    language,
                );

                errorManager.setLoading(false);
                vscode.window.showInformationMessage("模板编译成功！");
                console.log("Compiled template:", compiled);

                const outputChannel = vscode.window.createOutputChannel(
                    "Doki Template Output",
                );
                outputChannel.show();
                outputChannel.appendLine(compiled);
            } catch (error) {
                errorManager.setLoading(false);

                const errorInfo = parseError(error, document);
                errorManager.addError(errorInfo);

                await showFriendlyErrorDialog(errorInfo, errorManager);
            }
        },
    );

    const goToErrorCommand = vscode.commands.registerCommand(
        "doki.goToError",
        async (fileUri: string, line: number, col: number) => {
            try {
                const uri = vscode.Uri.parse(fileUri);
                const doc = await vscode.workspace.openTextDocument(uri);
                const editor = await vscode.window.showTextDocument(doc);
                const position = new vscode.Position(line - 1, col - 1);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(
                    new vscode.Range(position, position),
                    vscode.TextEditorRevealType.InCenter,
                );
            } catch (_e) {
                vscode.window.showErrorMessage("无法打开文件位置");
            }
        },
    );

    /**
     * 模板继承状态栏管理器
     */
    const inheritanceStatusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        99,
    );
    inheritanceStatusBar.command = "doki.showInheritance";
    inheritanceStatusBar.hide();

    /**
     * 更新模板继承状态栏
     */
    async function updateInheritanceStatusBar(): Promise<void> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            inheritanceStatusBar.hide();
            return;
        }

        const document = activeEditor.document;
        const extension = document.fileName.split(".").pop()?.toLowerCase();

        if (
            extension !== "dj" &&
            extension !== "doki" &&
            extension !== "dejavu"
        ) {
            inheritanceStatusBar.hide();
            return;
        }

        try {
            const templateContent = document.getText();
            const language =
                extension === "dejavu" ? DEJAVU_LANGUAGE : DOKI_LANGUAGE;
            const ast = engine.checkTemplate(templateContent, language);

            const extendsTemplate = findExtendsStatement(ast);
            const blocks = findBlockStatements(ast);

            if (extendsTemplate) {
                const fileName =
                    extendsTemplate.split(/[/\\]/).pop() || extendsTemplate;
                inheritanceStatusBar.text = `$(arrow-up) 继承: ${fileName}`;
                inheritanceStatusBar.tooltip = `当前模板继承自: ${extendsTemplate}\n定义的块: ${blocks.length} 个\n点击查看详情`;
                inheritanceStatusBar.show();
            } else if (blocks.length > 0) {
                inheritanceStatusBar.text = `$(file) 根模板`;
                inheritanceStatusBar.tooltip = `当前模板是根模板\n定义的块: ${blocks.length} 个`;
                inheritanceStatusBar.show();
            } else {
                inheritanceStatusBar.hide();
            }
        } catch {
            inheritanceStatusBar.hide();
        }
    }

    /**
     * 查找 extends 语句
     */
    function findExtendsStatement(ast: any): string | undefined {
        if (!ast || !ast.body) {
            return undefined;
        }

        for (const node of ast.body) {
            if (
                node.type === "ExtendsStatement" &&
                node.template &&
                node.template.value
            ) {
                return node.template.value;
            }
        }

        return undefined;
    }

    /**
     * 查找所有 block 语句
     */
    function findBlockStatements(ast: any): string[] {
        const blocks: string[] = [];

        function traverse(node: any): void {
            if (!node) return;

            if (
                node.type === "BlockDeclaration" &&
                node.name &&
                node.name.name
            ) {
                blocks.push(node.name.name);
            }
            if (
                node.type === "PrependStatement" &&
                node.name &&
                node.name.name
            ) {
                blocks.push(node.name.name);
            }
            if (
                node.type === "AppendStatement" &&
                node.name &&
                node.name.name
            ) {
                blocks.push(node.name.name);
            }

            if (node.body && Array.isArray(node.body)) {
                for (const child of node.body) {
                    traverse(child);
                }
            }
        }

        if (ast?.body) {
            for (const node of ast.body) {
                traverse(node);
            }
        }

        return blocks;
    }

    /**
     * 显示模板继承详情
     */
    const showInheritanceCommand = vscode.commands.registerCommand(
        "doki.showInheritance",
        async () => {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showErrorMessage("未找到活动的编辑器");
                return;
            }

            const document = activeEditor.document;
            const extension = document.fileName.split(".").pop()?.toLowerCase();

            if (
                extension !== "dj" &&
                extension !== "doki" &&
                extension !== "dejavu"
            ) {
                vscode.window.showErrorMessage("当前文件不是 Doki 模板");
                return;
            }

            try {
                const templateContent = document.getText();
                const language =
                    extension === "dejavu" ? DEJAVU_LANGUAGE : DOKI_LANGUAGE;
                const ast = engine.checkTemplate(templateContent, language);

                const extendsTemplate = findExtendsStatement(ast);
                const blocks = findBlockStatements(ast);
                const fileName =
                    document.fileName.split(/[/\\]/).pop() || document.fileName;

                const lines: string[] = [];
                lines.push(`模板: ${fileName}`);
                lines.push("");

                if (extendsTemplate) {
                    lines.push(`继承自: ${extendsTemplate}`);
                    lines.push("");
                } else {
                    lines.push("类型: 根模板（无继承）");
                    lines.push("");
                }

                if (blocks.length > 0) {
                    lines.push(`定义的块 (${blocks.length} 个):`);
                    for (const block of blocks) {
                        lines.push(`  - ${block}`);
                    }
                } else {
                    lines.push("未定义任何块");
                }

                const outputChannel =
                    vscode.window.createOutputChannel("Doki 模板继承");
                outputChannel.show();
                outputChannel.appendLine(lines.join("\n"));
            } catch (error) {
                const errorMessage =
                    error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`解析模板失败: ${errorMessage}`);
            }
        },
    );

    /**
     * 监听编辑器切换事件
     */
    vscode.window.onDidChangeActiveTextEditor(() => {
        updateInheritanceStatusBar();
    });

    /**
     * 监听文档保存事件
     */
    vscode.workspace.onDidSaveTextDocument(() => {
        updateInheritanceStatusBar();
    });

    /**
     * 初始化状态栏
     */
    updateInheritanceStatusBar();

    context.subscriptions.push(
        compileTemplateCommand,
        showErrorsCommand,
        clearErrorsCommand,
        copyErrorCommand,
        viewErrorDocsCommand,
        goToErrorCommand,
        showInheritanceCommand,
        errorManager,
        treeView,
        inheritanceStatusBar,
    );

    PreviewProvider.register(context, engine);

    const completionProvider = vscode.languages.registerCompletionItemProvider(
        [
            { scheme: "file", language: "doki" },
            { scheme: "file", language: "dejavu" },
        ],
        new DokiCompletionProvider(),
        " ",
        "|",
    );

    const signatureHelpProvider =
        vscode.languages.registerSignatureHelpProvider(
            [
                { scheme: "file", language: "doki" },
                { scheme: "file", language: "dejavu" },
            ],
            new DokiSignatureHelpProvider(),
            " ",
            "(",
            ",",
        );

    context.subscriptions.push(completionProvider, signatureHelpProvider);

    const diagnosticsProvider = createDiagnosticsProvider(context, engine);
    registerCodeActionProvider(context, diagnosticsProvider);
    registerFixAllCommand(context, diagnosticsProvider);

    const serverOptions: ServerOptions = {
        // Full IDE/LSP experience comes from the Rust `dejavu` binary — not a Node LSP.
        run: {
            command: "dejavu",
            args: ["lsp"],
            transport: TransportKind.stdio,
        },
        debug: {
            command: "dejavu",
            args: ["lsp"],
            transport: TransportKind.stdio,
        },
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: "file", language: "doki" },
            { scheme: "file", language: "dejavu" },
        ],
        synchronize: {
            configurationSection: ["doki"],
        },
    };

    client = new LanguageClient(
        "dejavu-lsp",
        "Dejavu Language Server (Rust binary)",
        serverOptions,
        clientOptions,
    );

    client.start().catch((error) => {
        console.error(
            "Failed to start Dejavu LSP. Install the Rust `dejavu` binary and ensure `dejavu lsp` is on PATH.",
            error,
        );
        void vscode.window.showErrorMessage(
            "Dejavu LSP requires the Rust `dejavu` binary (`dejavu lsp` on PATH).",
        );
    });
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
