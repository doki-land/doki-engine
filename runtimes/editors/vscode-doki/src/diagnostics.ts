import {
    DEJAVU_LANGUAGE,
    DOKI_LANGUAGE,
    type DokiEngine,
} from "@doki-land/doki-engine";
import * as vscode from "vscode";

/**
 * 诊断代码枚举
 * 定义所有可能的诊断问题代码
 */
export enum DiagnosticCode {
    /**
     * 语法错误
     */
    SYNTAX_ERROR = "E001",

    /**
     * 未闭合标签
     */
    UNCLOSED_TAG = "E002",

    /**
     * 未闭合字符串
     */
    UNCLOSED_STRING = "E003",

    /**
     * 未定义变量
     */
    UNDEFINED_VARIABLE = "W001",

    /**
     * 缺少结束标记
     */
    MISSING_END = "E004",

    /**
     * 无效表达式
     */
    INVALID_EXPRESSION = "E005",

    /**
     * 未定义函数
     */
    UNDEFINED_FUNCTION = "W002",

    /**
     * 定界符不匹配
     */
    DELIMITER_MISMATCH = "E006",

    /**
     * 意外的标记
     */
    UNEXPECTED_TOKEN = "E007",

    /**
     * 类型不匹配
     */
    TYPE_MISMATCH = "W003",
}

/**
 * 格式化错误接口
 * 定义错误信息的结构
 */
export interface FormattedError {
    /**
     * 诊断代码
     */
    code: DiagnosticCode;

    /**
     * 错误消息
     */
    message: string;

    /**
     * 行号（从 0 开始）
     */
    line: number;

    /**
     * 列号（从 0 开始）
     */
    column: number;

    /**
     * 结束行号
     */
    endLine?: number;

    /**
     * 结束列号
     */
    endColumn?: number;

    /**
     * 严重程度
     */
    severity: vscode.DiagnosticSeverity;

    /**
     * 来源标识
     */
    source: string;

    /**
     * 相关信息
     */
    relatedInformation?: vscode.DiagnosticRelatedInformation[];
}

/**
 * 快速修复接口
 * 定义快速修复操作的结构
 */
export interface QuickFix {
    /**
     * 修复标题
     */
    title: string;

    /**
     * 修复类型
     */
    kind: vscode.CodeActionKind;

    /**
     * 是否首选修复
     */
    isPreferred?: boolean;
}

/**
 * 诊断配置接口
 */
interface DiagnosticConfig {
    /**
     * 是否启用诊断
     */
    enabled: boolean;

    /**
     * 各类问题的严重程度配置
     */
    severity: Record<string, vscode.DiagnosticSeverity>;
}

/**
 * 快速修复配置映射
 * 为每种诊断代码提供可用的快速修复
 */
const QUICK_FIXES: Record<string, QuickFix[]> = {
    [DiagnosticCode.UNCLOSED_TAG]: [
        {
            title: "添加结束标签",
            kind: vscode.CodeActionKind.QuickFix,
            isPreferred: true,
        },
        {
            title: "删除开始标签",
            kind: vscode.CodeActionKind.QuickFix,
        },
    ],
    [DiagnosticCode.UNCLOSED_STRING]: [
        {
            title: "添加闭合引号",
            kind: vscode.CodeActionKind.QuickFix,
            isPreferred: true,
        },
    ],
    [DiagnosticCode.UNDEFINED_VARIABLE]: [
        {
            title: "声明变量",
            kind: vscode.CodeActionKind.QuickFix,
            isPreferred: true,
        },
        {
            title: "导入变量",
            kind: vscode.CodeActionKind.QuickFix,
        },
    ],
    [DiagnosticCode.UNDEFINED_FUNCTION]: [
        {
            title: "定义函数",
            kind: vscode.CodeActionKind.QuickFix,
            isPreferred: true,
        },
        {
            title: "导入函数",
            kind: vscode.CodeActionKind.QuickFix,
        },
    ],
    [DiagnosticCode.MISSING_END]: [
        {
            title: "添加结束语句",
            kind: vscode.CodeActionKind.QuickFix,
            isPreferred: true,
        },
    ],
    [DiagnosticCode.DELIMITER_MISMATCH]: [
        {
            title: "添加缺失的定界符",
            kind: vscode.CodeActionKind.QuickFix,
            isPreferred: true,
        },
        {
            title: "删除多余的定界符",
            kind: vscode.CodeActionKind.QuickFix,
        },
    ],
};

/**
 * Doki 诊断提供器
 * 负责提供模板文件的语法检查和诊断功能
 */
export class DiagnosticsProvider {
    /**
     * 诊断集合
     */
    private diagnosticCollection: vscode.DiagnosticCollection;

    /**
     * Doki 引擎实例
     */
    private engine: DokiEngine;

    /**
     * 诊断配置
     */
    private config: DiagnosticConfig;

    /**
     * 防抖定时器
     */
    private debounceTimer: NodeJS.Timeout | undefined;

    /**
     * 防抖延迟时间（毫秒）
     */
    private readonly DEBOUNCE_DELAY = 300;

    /**
     * 构造函数
     * @param context VSCode 扩展上下文
     * @param engine Doki 引擎实例
     */
    constructor(context: vscode.ExtensionContext, engine: DokiEngine) {
        this.engine = engine;
        this.diagnosticCollection =
            vscode.languages.createDiagnosticCollection("doki");
        this.config = this.loadConfig();

        context.subscriptions.push(this.diagnosticCollection);

        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(() => {
                this.config = this.loadConfig();
            }),
        );
    }

    /**
     * 加载诊断配置
     * @returns 诊断配置对象
     */
    private loadConfig(): DiagnosticConfig {
        const config = vscode.workspace.getConfiguration("doki.diagnostics");

        const severityMap: Record<string, vscode.DiagnosticSeverity> = {
            error: vscode.DiagnosticSeverity.Error,
            warning: vscode.DiagnosticSeverity.Warning,
            hint: vscode.DiagnosticSeverity.Hint,
            information: vscode.DiagnosticSeverity.Information,
        };

        const severityConfig = config.get<Record<string, string>>(
            "severity",
            {},
        );

        const severity: Record<string, vscode.DiagnosticSeverity> = {};
        for (const [key, value] of Object.entries(severityConfig)) {
            severity[key] =
                severityMap[value] ?? vscode.DiagnosticSeverity.Error;
        }

        return {
            enabled: config.get<boolean>("enabled", true),
            severity,
        };
    }

    /**
     * 更新文档的诊断信息
     * @param document 文本文档
     */
    public updateDiagnostics(document: vscode.TextDocument): void {
        if (!this.config.enabled) {
            this.diagnosticCollection.delete(document.uri);
            return;
        }

        if (!this.isDokiDocument(document)) {
            return;
        }

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.doUpdateDiagnostics(document);
        }, this.DEBOUNCE_DELAY);
    }

    /**
     * 立即更新诊断（不防抖）
     * @param document 文本文档
     */
    public updateDiagnosticsImmediate(document: vscode.TextDocument): void {
        if (!this.config.enabled) {
            this.diagnosticCollection.delete(document.uri);
            return;
        }

        if (!this.isDokiDocument(document)) {
            return;
        }

        this.doUpdateDiagnostics(document);
    }

    /**
     * 执行诊断更新
     * @param document 文本文档
     */
    private doUpdateDiagnostics(document: vscode.TextDocument): void {
        const content = document.getText();
        const diagnostics: vscode.Diagnostic[] = [];

        const syntaxErrors = this.parseErrors(content, document);
        diagnostics.push(...syntaxErrors);

        const undefinedVarWarnings = this.checkUndefinedVariables(
            content,
            document,
        );
        diagnostics.push(...undefinedVarWarnings);

        const undefinedFuncWarnings = this.checkUndefinedFunctions(
            content,
            document,
        );
        diagnostics.push(...undefinedFuncWarnings);

        const delimiterErrors = this.checkDelimiters(content, document);
        diagnostics.push(...delimiterErrors);

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    /**
     * 检查是否为 Doki 文档
     * @param document 文本文档
     * @returns 是否为 Doki 文档
     */
    private isDokiDocument(document: vscode.TextDocument): boolean {
        return (
            document.languageId === "doki" || document.languageId === "dejavu"
        );
    }

    /**
     * 解析语法错误
     * @param content 文档内容
     * @param document 文本文档
     * @returns 诊断数组
     */
    private parseErrors(
        content: string,
        document: vscode.TextDocument,
    ): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];

        try {
            const language =
                document.languageId === "dejavu"
                    ? DEJAVU_LANGUAGE
                    : DOKI_LANGUAGE;
            this.engine.checkTemplate(content, language);
        } catch (error) {
            const formattedErrors = this.extractErrorsFromException(
                error,
                document,
            );
            for (const err of formattedErrors) {
                diagnostics.push(this.createDiagnostic(err, document));
            }
        }

        return diagnostics;
    }

    /**
     * 从异常中提取错误信息
     * @param error 异常对象
     * @param document 文本文档
     * @returns 格式化错误数组
     */
    private extractErrorsFromException(
        error: unknown,
        document: vscode.TextDocument,
    ): FormattedError[] {
        const errors: FormattedError[] = [];
        const errorMessage =
            error instanceof Error ? error.message : String(error);

        const lineMatch = errorMessage.match(/(?:line|行)\s*(\d+)/i);
        const colMatch = errorMessage.match(/(?:column|列|col)\s*(\d+)/i);
        const posMatch = errorMessage.match(/:(\d+):(\d+)/);

        let line = 0;
        let column = 0;

        if (posMatch) {
            line = parseInt(posMatch[1], 10) - 1;
            column = parseInt(posMatch[2], 10) - 1;
        } else if (lineMatch) {
            line = parseInt(lineMatch[1], 10) - 1;
            column = colMatch ? parseInt(colMatch[1], 10) - 1 : 0;
        }

        line = Math.max(0, Math.min(line, document.lineCount - 1));
        column = Math.max(0, column);

        const code = this.inferDiagnosticCode(errorMessage);
        const severity = this.getSeverityForCode(code);

        errors.push({
            code,
            message: errorMessage,
            line,
            column,
            severity,
            source: "doki",
        });

        return errors;
    }

    /**
     * 根据错误消息推断诊断代码
     * @param message 错误消息
     * @returns 诊断代码
     */
    private inferDiagnosticCode(message: string): DiagnosticCode {
        const lowerMessage = message.toLowerCase();

        if (
            lowerMessage.includes("unclosed") ||
            lowerMessage.includes("未闭合")
        ) {
            if (lowerMessage.includes("tag") || lowerMessage.includes("标签")) {
                return DiagnosticCode.UNCLOSED_TAG;
            }
            if (
                lowerMessage.includes("string") ||
                lowerMessage.includes("字符串") ||
                lowerMessage.includes("quote")
            ) {
                return DiagnosticCode.UNCLOSED_STRING;
            }
        }

        if (
            lowerMessage.includes("undefined") ||
            lowerMessage.includes("未定义")
        ) {
            if (
                lowerMessage.includes("function") ||
                lowerMessage.includes("函数")
            ) {
                return DiagnosticCode.UNDEFINED_FUNCTION;
            }
            return DiagnosticCode.UNDEFINED_VARIABLE;
        }

        if (
            lowerMessage.includes("missing") ||
            lowerMessage.includes("缺少") ||
            lowerMessage.includes("缺失")
        ) {
            if (lowerMessage.includes("end") || lowerMessage.includes("结束")) {
                return DiagnosticCode.MISSING_END;
            }
        }

        if (
            lowerMessage.includes("delimiter") ||
            lowerMessage.includes("定界符")
        ) {
            return DiagnosticCode.DELIMITER_MISMATCH;
        }

        if (
            lowerMessage.includes("unexpected") ||
            lowerMessage.includes("意外") ||
            lowerMessage.includes("不期望")
        ) {
            return DiagnosticCode.UNEXPECTED_TOKEN;
        }

        if (
            lowerMessage.includes("invalid") ||
            lowerMessage.includes("无效") ||
            lowerMessage.includes("expression")
        ) {
            return DiagnosticCode.INVALID_EXPRESSION;
        }

        if (lowerMessage.includes("type") || lowerMessage.includes("类型")) {
            return DiagnosticCode.TYPE_MISMATCH;
        }

        return DiagnosticCode.SYNTAX_ERROR;
    }

    /**
     * 获取诊断代码对应的严重程度
     * @param code 诊断代码
     * @returns 诊断严重程度
     */
    private getSeverityForCode(
        code: DiagnosticCode,
    ): vscode.DiagnosticSeverity {
        const severityKey = this.getSeverityKey(code);
        return (
            this.config.severity[severityKey] ?? this.getDefaultSeverity(code)
        );
    }

    /**
     * 获取严重程度配置键
     * @param code 诊断代码
     * @returns 配置键
     */
    private getSeverityKey(code: DiagnosticCode): string {
        const mapping: Record<DiagnosticCode, string> = {
            [DiagnosticCode.SYNTAX_ERROR]: "syntaxError",
            [DiagnosticCode.UNCLOSED_TAG]: "syntaxError",
            [DiagnosticCode.UNCLOSED_STRING]: "syntaxError",
            [DiagnosticCode.UNDEFINED_VARIABLE]: "undefinedVariable",
            [DiagnosticCode.MISSING_END]: "syntaxError",
            [DiagnosticCode.INVALID_EXPRESSION]: "syntaxError",
            [DiagnosticCode.UNDEFINED_FUNCTION]: "undefinedFunction",
            [DiagnosticCode.DELIMITER_MISMATCH]: "syntaxError",
            [DiagnosticCode.UNEXPECTED_TOKEN]: "syntaxError",
            [DiagnosticCode.TYPE_MISMATCH]: "typeMismatch",
        };
        return mapping[code] ?? "syntaxError";
    }

    /**
     * 获取诊断代码的默认严重程度
     * @param code 诊断代码
     * @returns 默认严重程度
     */
    private getDefaultSeverity(
        code: DiagnosticCode,
    ): vscode.DiagnosticSeverity {
        if (code.startsWith("W")) {
            return vscode.DiagnosticSeverity.Warning;
        }
        return vscode.DiagnosticSeverity.Error;
    }

    /**
     * 检查未定义变量
     * @param content 文档内容
     * @param document 文本文档
     * @returns 诊断数组
     */
    private checkUndefinedVariables(
        content: string,
        document: vscode.TextDocument,
    ): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const lines = content.split("\n");

        const definedVars = new Set<string>();

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];

            const letMatch = line.matchAll(/let\s+([a-zA-Z_][a-zA-Z0-9_]*)/g);
            for (const match of letMatch) {
                definedVars.add(match[1]);
            }

            const forMatch = line.matchAll(
                /for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in/g,
            );
            for (const match of forMatch) {
                definedVars.add(match[1]);
            }

            const loopMatch = line.matchAll(
                /loop\s+(?:\([^)]*,\s*)?([a-zA-Z_][a-zA-Z0-9_]*)\s+in/g,
            );
            for (const match of loopMatch) {
                definedVars.add(match[1]);
            }
        }

        const builtInVars = new Set([
            "true",
            "false",
            "null",
            "undefined",
            "now",
            "today",
            "range",
            "len",
            "upper",
            "lower",
            "trim",
            "split",
            "join",
            "replace",
            "format",
            "escape",
            "safe",
            "default",
            "first",
            "last",
            "reverse",
            "sort",
            "map",
            "filter",
            "reject",
            "select",
            "uniq",
            "length",
            "size",
        ]);

        // 所有 code block 内出现的标识符都要检查
        const blockPattern = /([<{]%[\s\S]*?[%}>])/g;
        let blockMatch: RegExpExecArray | null;
        const hits: Array<{ line: number; col: number; name: string }> = [];

        blockMatch = blockPattern.exec(content);
        while (blockMatch !== null) {
            const blockText = blockMatch[1];
            const blockStart = blockMatch.index;
            const identifierPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
            let identMatch: RegExpExecArray | null;
            identMatch = identifierPattern.exec(blockText);
            while (identMatch !== null) {
                const lineNum =
                    content
                        .substring(0, blockStart + identMatch.index)
                        .split("\n").length - 1;
                const lineStart = content.lastIndexOf(
                    "\n",
                    blockStart + identMatch.index,
                );
                const col =
                    blockStart +
                    identMatch.index -
                    (lineStart === -1 ? 0 : lineStart);
                hits.push({ line: lineNum, col, name: identMatch[1] });
                identMatch = identifierPattern.exec(blockText);
            }
            blockMatch = blockPattern.exec(content);
        }

        for (const hit of hits) {
            const varName = hit.name;
            if (
                definedVars.has(varName) ||
                builtInVars.has(varName) ||
                this.isKeyword(varName)
            ) {
                continue;
            }
            const severity = this.getSeverityForCode(
                DiagnosticCode.UNDEFINED_VARIABLE,
            );
            diagnostics.push(
                this.createDiagnostic(
                    {
                        code: DiagnosticCode.UNDEFINED_VARIABLE,
                        message: `未定义的变量: ${varName}`,
                        line: hit.line,
                        column: hit.col,
                        endLine: hit.line,
                        endColumn: hit.col + varName.length,
                        severity,
                        source: "doki",
                    },
                    document,
                ),
            );
        }

        return diagnostics;
    }

    /** 语言关键字，不当作未定义变量 */
    private isKeyword(name: string): boolean {
        const keywords = new Set([
            "if",
            "else",
            "end",
            "endif",
            "endfor",
            "endwhile",
            "endblock",
            "endmicro",
            "endmatch",
            "elseif",
            "loop",
            "endloop",
            "block",
            "extends",
            "include",
            "let",
            "micro",
            "match",
            "case",
            "using",
            "namespace",
            "break",
            "continue",
            "return",
            "prepend",
            "append",
            "super",
            "in",
            "do",
            "while",
            "for",
        ]);
        return keywords.has(name);
    }

    /**
     * 检查未定义函数
     * @param content 文档内容
     * @param document 文本文档
     * @returns 诊断数组
     */
    private checkUndefinedFunctions(
        content: string,
        document: vscode.TextDocument,
    ): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const lines = content.split("\n");

        const callPattern = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
        const definedFuncs = new Set<string>();

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];

            const microMatch = line.matchAll(
                /micro\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
            );
            for (const match of microMatch) {
                definedFuncs.add(match[1]);
            }
        }

        const builtInFuncs = new Set([
            "print",
            "println",
            "printf",
            "len",
            "range",
            "upper",
            "lower",
            "trim",
            "split",
            "join",
            "replace",
            "format",
            "escape",
            "safe",
            "default",
            "first",
            "last",
            "reverse",
            "sort",
            "map",
            "filter",
            "reject",
            "select",
            "uniq",
            "include",
            "extends",
            "block",
            "super",
            "hasBlock",
        ]);

        const controlKeywords = new Set([
            "if",
            "for",
            "while",
            "switch",
            "case",
            "micro",
            "let",
            "return",
            "break",
            "continue",
            "include",
            "extends",
            "block",
            "end",
            "else",
            "elif",
            "endif",
            "endfor",
            "endwhile",
            "endswitch",
            "endblock",
            "endmicro",
        ]);

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            let match: RegExpExecArray | null;

            callPattern.lastIndex = 0;
            match = callPattern.exec(line);
            while (match !== null) {
                const funcName = match[1];

                if (
                    !definedFuncs.has(funcName) &&
                    !builtInFuncs.has(funcName) &&
                    !controlKeywords.has(funcName)
                ) {
                    const column = match.index;
                    const severity = this.getSeverityForCode(
                        DiagnosticCode.UNDEFINED_FUNCTION,
                    );

                    diagnostics.push(
                        this.createDiagnostic(
                            {
                                code: DiagnosticCode.UNDEFINED_FUNCTION,
                                message: `未定义的函数: ${funcName}`,
                                line: lineIndex,
                                column,
                                endLine: lineIndex,
                                endColumn: column + funcName.length,
                                severity,
                                source: "doki",
                            },
                            document,
                        ),
                    );
                }
                match = callPattern.exec(line);
            }
        }

        return diagnostics;
    }

    /**
     * 检查定界符匹配
     * @param content 文档内容
     * @param document 文本文档
     * @returns 诊断数组
     */
    private checkDelimiters(
        content: string,
        document: vscode.TextDocument,
    ): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const lines = content.split("\n");

        const codeStartDelim = vscode.workspace
            .getConfiguration("doki.template.delimiters")
            .get<string>("codeStart", "{%");
        const codeEndDelim = vscode.workspace
            .getConfiguration("doki.template.delimiters")
            .get<string>("codeEnd", "%}");
        const commentStartDelim = vscode.workspace
            .getConfiguration("doki.template.delimiters")
            .get<string>("commentStart", "{#");
        const commentEndDelim = vscode.workspace
            .getConfiguration("doki.template.delimiters")
            .get<string>("commentEnd", "#}");

        const delimiterPairs: Array<{
            start: string;
            end: string;
            name: string;
        }> = [
            { start: codeStartDelim, end: codeEndDelim, name: "代码块" },
            { start: commentStartDelim, end: commentEndDelim, name: "注释块" },
        ];

        for (const pair of delimiterPairs) {
            const startCount = this.countOccurrences(content, pair.start);
            const endCount = this.countOccurrences(content, pair.end);

            if (startCount !== endCount) {
                let firstUnmatchedLine = -1;
                let firstUnmatchedCol = -1;

                const searchPattern =
                    startCount > endCount ? pair.start : pair.end;
                for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                    const colIndex = lines[lineIndex].indexOf(searchPattern);
                    if (colIndex !== -1) {
                        firstUnmatchedLine = lineIndex;
                        firstUnmatchedCol = colIndex;
                        break;
                    }
                }

                if (firstUnmatchedLine === -1) {
                    firstUnmatchedLine = 0;
                    firstUnmatchedCol = 0;
                }

                const severity = this.getSeverityForCode(
                    DiagnosticCode.DELIMITER_MISMATCH,
                );
                const message =
                    startCount > endCount
                        ? `${pair.name}定界符不匹配: 缺少 ${startCount - endCount} 个结束定界符 "${pair.end}"`
                        : `${pair.name}定界符不匹配: 多余 ${endCount - startCount} 个结束定界符 "${pair.end}"`;

                diagnostics.push(
                    this.createDiagnostic(
                        {
                            code: DiagnosticCode.DELIMITER_MISMATCH,
                            message,
                            line: firstUnmatchedLine,
                            column: firstUnmatchedCol,
                            severity,
                            source: "doki",
                        },
                        document,
                    ),
                );
            }
        }

        return diagnostics;
    }

    /**
     * 计算字符串中子串出现的次数
     * @param content 源字符串
     * @param substring 子串
     * @returns 出现次数
     */
    private countOccurrences(content: string, substring: string): number {
        let count = 0;
        let position = 0;

        while (true) {
            const index = content.indexOf(substring, position);
            if (index === -1) {
                break;
            }
            count++;
            position = index + substring.length;
        }

        return count;
    }

    /**
     * 创建诊断对象
     * @param error 格式化错误
     * @param document 文本文档
     * @returns 诊断对象
     */
    private createDiagnostic(
        error: FormattedError,
        document: vscode.TextDocument,
    ): vscode.Diagnostic {
        const line = Math.min(Math.max(0, error.line), document.lineCount - 1);
        const lineText = document.lineAt(line).text;
        const column = Math.min(Math.max(0, error.column), lineText.length);

        let endLine = error.endLine ?? line;
        let endColumn = error.endColumn ?? column + 1;

        endLine = Math.min(Math.max(0, endLine), document.lineCount - 1);
        const endLineText = document.lineAt(endLine).text;
        endColumn = Math.min(Math.max(0, endColumn), endLineText.length);

        if (line === endLine && column >= endColumn) {
            endColumn = column + 1;
        }

        const range = new vscode.Range(
            new vscode.Position(line, column),
            new vscode.Position(endLine, endColumn),
        );

        const diagnostic = new vscode.Diagnostic(
            range,
            error.message,
            error.severity,
        );

        diagnostic.code = error.code;
        diagnostic.source = error.source;

        if (error.relatedInformation) {
            diagnostic.relatedInformation = error.relatedInformation;
        }

        return diagnostic;
    }

    /**
     * 清除指定文档的诊断信息
     * @param document 文本文档
     */
    public clearDiagnostics(document: vscode.TextDocument): void {
        this.diagnosticCollection.delete(document.uri);
    }

    /**
     * 清除所有诊断信息
     */
    public clearAllDiagnostics(): void {
        this.diagnosticCollection.clear();
    }

    /**
     * 获取文档的诊断信息
     * @param document 文本文档
     * @returns 诊断数组
     */
    public getDiagnostics(document: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics = this.diagnosticCollection.get(document.uri);
        return diagnostics ? [...diagnostics] : [];
    }

    /**
     * 释放资源
     */
    public dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.diagnosticCollection.dispose();
    }
}

/**
 * Doki 代码操作提供器
 * 提供快速修复功能
 */
export class DokiCodeActionProvider implements vscode.CodeActionProvider {
    /**
     * 提供的代码操作类型
     */
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
    ];

    /**
     * 诊断提供器引用
     */
    private diagnosticsProvider: DiagnosticsProvider;

    /**
     * 构造函数
     * @param diagnosticsProvider 诊断提供器
     */
    constructor(diagnosticsProvider: DiagnosticsProvider) {
        this.diagnosticsProvider = diagnosticsProvider;
    }

    /**
     * 提供代码操作
     * @param document 文本文档
     * @param range 范围或选择
     * @param context 代码操作上下文
     * @param token 取消令牌
     * @returns 代码操作数组
     */
    public provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        _token: vscode.CancellationToken,
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            if (diagnostic.source !== "doki") {
                continue;
            }

            const code = diagnostic.code as string;
            const quickFixes = QUICK_FIXES[code];

            if (quickFixes) {
                for (const fix of quickFixes) {
                    const action = this.createCodeAction(
                        document,
                        diagnostic,
                        fix,
                    );
                    if (action) {
                        actions.push(action);
                    }
                }
            }
        }

        const fixAllAction = this.createFixAllAction(document);
        if (fixAllAction) {
            actions.push(fixAllAction);
        }

        return actions;
    }

    /**
     * 创建代码操作
     * @param document 文本文档
     * @param diagnostic 诊断对象
     * @param fix 快速修复配置
     * @returns 代码操作或 undefined
     */
    private createCodeAction(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic,
        fix: QuickFix,
    ): vscode.CodeAction | undefined {
        const code = diagnostic.code as string;
        const action = new vscode.CodeAction(fix.title, fix.kind);

        action.diagnostics = [diagnostic];
        action.isPreferred = fix.isPreferred;

        const edit = this.createEditForFix(
            document,
            diagnostic,
            code,
            fix.title,
        );
        if (edit) {
            action.edit = edit;
            return action;
        }

        return undefined;
    }

    /**
     * 为修复创建编辑操作
     * @param document 文本文档
     * @param diagnostic 诊断对象
     * @param code 诊断代码
     * @param fixTitle 修复标题
     * @returns 工作区编辑或 undefined
     */
    private createEditForFix(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic,
        code: string,
        fixTitle: string,
    ): vscode.WorkspaceEdit | undefined {
        const edit = new vscode.WorkspaceEdit();
        const range = diagnostic.range;
        const lineText = document.lineAt(range.start.line).text;

        switch (code) {
            case DiagnosticCode.UNCLOSED_TAG: {
                if (fixTitle === "添加结束标签") {
                    const tagMatch = lineText.match(/<%\s*(\w+)/);
                    if (tagMatch) {
                        const tagName = tagMatch[1];
                        const endTag = `<% end${tagName} %>`;
                        const insertPos = new vscode.Position(
                            range.start.line,
                            lineText.length,
                        );
                        edit.insert(document.uri, insertPos, `\n${endTag}`);
                    }
                } else if (fixTitle === "删除开始标签") {
                    edit.delete(document.uri, range);
                }
                break;
            }

            case DiagnosticCode.UNCLOSED_STRING: {
                if (fixTitle === "添加闭合引号") {
                    const stringMatch = lineText.match(/["']/);
                    if (stringMatch) {
                        const quote = stringMatch[0];
                        const insertPos = new vscode.Position(
                            range.start.line,
                            range.end.character,
                        );
                        edit.insert(document.uri, insertPos, quote);
                    }
                }
                break;
            }

            case DiagnosticCode.UNDEFINED_VARIABLE: {
                if (fixTitle === "声明变量") {
                    const varMatch = diagnostic.message.match(/变量:\s*(\w+)/);
                    if (varMatch) {
                        const varName = varMatch[1];
                        const insertText = `<% let ${varName} =  %>`;
                        const lineStart = new vscode.Position(
                            range.start.line,
                            0,
                        );
                        edit.insert(document.uri, lineStart, `${insertText}\n`);
                    }
                }
                break;
            }

            case DiagnosticCode.UNDEFINED_FUNCTION: {
                if (fixTitle === "定义函数") {
                    const funcMatch = diagnostic.message.match(/函数:\s*(\w+)/);
                    if (funcMatch) {
                        const funcName = funcMatch[1];
                        const insertText = `<% micro ${funcName}() %>\n<% endmicro %>`;
                        const lineStart = new vscode.Position(
                            range.start.line,
                            0,
                        );
                        edit.insert(document.uri, lineStart, `${insertText}\n`);
                    }
                }
                break;
            }

            case DiagnosticCode.MISSING_END: {
                if (fixTitle === "添加结束语句") {
                    const blockMatch = lineText.match(
                        /<%\s*(if|for|while|micro|block)/,
                    );
                    if (blockMatch) {
                        const blockType = blockMatch[1];
                        const endStatement = `<% end${blockType} %>`;
                        const insertPos = new vscode.Position(
                            range.start.line,
                            lineText.length,
                        );
                        edit.insert(
                            document.uri,
                            insertPos,
                            `\n${endStatement}`,
                        );
                    }
                }
                break;
            }

            case DiagnosticCode.DELIMITER_MISMATCH: {
                if (fixTitle === "添加缺失的定界符") {
                    const codeEndDelim = vscode.workspace
                        .getConfiguration("doki.template.delimiters")
                        .get<string>("codeEnd", "%>");
                    const insertPos = new vscode.Position(
                        range.start.line,
                        lineText.length,
                    );
                    edit.insert(document.uri, insertPos, codeEndDelim);
                } else if (fixTitle === "删除多余的定界符") {
                    edit.delete(document.uri, range);
                }
                break;
            }

            default:
                return undefined;
        }

        return edit.size > 0 ? edit : undefined;
    }

    /**
     * 创建修复所有问题的操作
     * @param document 文本文档
     * @returns 代码操作或 undefined
     */
    private createFixAllAction(
        document: vscode.TextDocument,
    ): vscode.CodeAction | undefined {
        const diagnostics = this.diagnosticsProvider.getDiagnostics(document);
        const fixableDiagnostics = diagnostics.filter(
            (d) => d.source === "doki" && QUICK_FIXES[d.code as string],
        );

        if (fixableDiagnostics.length === 0) {
            return undefined;
        }

        const action = new vscode.CodeAction(
            "修复所有问题",
            vscode.CodeActionKind.SourceFixAll,
        );
        action.command = {
            command: "doki.fixAll",
            title: "修复所有问题",
        };

        return action;
    }
}

/**
 * 创建诊断提供器并注册事件监听
 * @param context VSCode 扩展上下文
 * @param engine Doki 引擎实例
 * @returns 诊断提供器实例
 */
export function createDiagnosticsProvider(
    context: vscode.ExtensionContext,
    engine: DokiEngine,
): DiagnosticsProvider {
    const provider = new DiagnosticsProvider(context, engine);

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((document) => {
            provider.updateDiagnostics(document);
        }),
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            provider.updateDiagnostics(event.document);
        }),
    );

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
            provider.updateDiagnosticsImmediate(document);
        }),
    );

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((document) => {
            provider.clearDiagnostics(document);
        }),
    );

    if (vscode.window.activeTextEditor) {
        provider.updateDiagnostics(vscode.window.activeTextEditor.document);
    }

    return provider;
}

/**
 * 注册代码操作提供器
 * @param context VSCode 扩展上下文
 * @param diagnosticsProvider 诊断提供器
 */
export function registerCodeActionProvider(
    context: vscode.ExtensionContext,
    diagnosticsProvider: DiagnosticsProvider,
): void {
    const selector = [
        { language: "doki", scheme: "file" },
        { language: "dejavu", scheme: "file" },
    ];

    const provider = new DokiCodeActionProvider(diagnosticsProvider);
    const metadata = {
        providedCodeActionKinds: DokiCodeActionProvider.providedCodeActionKinds,
    };

    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            selector,
            provider,
            metadata,
        ),
    );
}

/**
 * 注册修复所有问题的命令
 * @param context VSCode 扩展上下文
 * @param diagnosticsProvider 诊断提供器
 */
export function registerFixAllCommand(
    context: vscode.ExtensionContext,
    diagnosticsProvider: DiagnosticsProvider,
): void {
    const command = vscode.commands.registerCommand("doki.fixAll", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const document = editor.document;
        const diagnostics = diagnosticsProvider.getDiagnostics(document);

        if (diagnostics.length === 0) {
            vscode.window.showInformationMessage("没有需要修复的问题");
            return;
        }

        const fixableCount = diagnostics.filter(
            (d) => QUICK_FIXES[d.code as string],
        ).length;

        if (fixableCount === 0) {
            vscode.window.showInformationMessage("当前问题无法自动修复");
            return;
        }

        const choice = await vscode.window.showInformationMessage(
            `发现 ${fixableCount} 个可自动修复的问题，是否全部修复？`,
            "是",
            "否",
        );

        if (choice === "是") {
            await vscode.commands.executeCommand(
                "editor.action.codeAction",
                document.uri,
                new vscode.Range(
                    new vscode.Position(0, 0),
                    new vscode.Position(document.lineCount, 0),
                ),
                vscode.CodeActionKind.SourceFixAll,
            );

            vscode.window.showInformationMessage(
                `已修复 ${fixableCount} 个问题`,
            );
        }
    });

    context.subscriptions.push(command);
}
