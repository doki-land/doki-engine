import { describe, it, expect, beforeEach } from "vitest";
import {
    createCliError,
    configNotFoundError,
    configParseError,
    templateParseError,
    templateLoadError,
    contentProcessError,
    frontmatterError,
    outputDirError,
    fileNotFoundError,
    directoryError,
    buildError,
    renderError,
    serverStartError,
    portInUseError,
    browserOpenError,
    formatCliError,
    extractSourceContext,
    createErrorReport,
    printErrorReportSummary,
    type CliError,
    type SourceContext,
    type ErrorSuggestion,
} from "../src/cli-errors.js";
import {
    CliErrorCode,
    getErrorCodeMeta,
    formatDescription,
    isRecoverable,
    getDocumentationUrl,
    ErrorCodeMeta,
    type ErrorSeverity,
} from "../src/error-codes.js";
import {
    getSuggestions,
    getSuggestionTemplate,
    addCustomSuggestions,
    QUICK_FIXES,
    diagnoseError,
    SUGGESTION_TEMPLATES,
} from "../src/error-suggestions.js";
import {
    buildErrorChain,
    collectErrorsFromChain,
    getErrorChainDepth,
    extractSourceContextFromSource,
    groupErrorsByFile,
    groupErrorsByType,
    createErrorSummary,
    ErrorContextEnhancer,
    extractDejavuErrorInfo,
    isDejavuError,
    type ErrorChainNode,
    type DejavuErrorInfo,
} from "../src/error-context.js";

describe("Error Creation Functions", () => {
    describe("createCliError()", () => {
        it("should create a basic CLI error with code and type", () => {
            const error = createCliError(
                CliErrorCode.CONFIG_NOT_FOUND,
                "config",
            );

            expect(error.code).toBe(CliErrorCode.CONFIG_NOT_FOUND);
            expect(error.type).toBe("config");
            expect(error.title).toBe("配置文件未找到");
            expect(error.severity).toBe("error");
        });

        it("should create error with custom params", () => {
            const error = createCliError(CliErrorCode.FILE_NOT_FOUND, "io", {
                path: "/path/to/file.txt",
            });

            expect(error.message).toContain("/path/to/file.txt");
        });

        it("should create error with custom options", () => {
            const error = createCliError(
                CliErrorCode.CONFIG_PARSE_ERROR,
                "config",
                { detail: "Invalid TOML syntax" },
                {
                    title: "Custom Title",
                    filePath: "/custom/path.toml",
                    line: 10,
                    column: 5,
                },
            );

            expect(error.title).toBe("Custom Title");
            expect(error.filePath).toBe("/custom/path.toml");
            expect(error.line).toBe(10);
            expect(error.column).toBe(5);
        });

        it("should create error with suggestions", () => {
            const suggestions: ErrorSuggestion[] = [
                { type: "fix", message: "Fix the syntax error" },
                {
                    type: "command",
                    message: "Run check",
                    command: "doki check",
                },
            ];

            const error = createCliError(
                CliErrorCode.TEMPLATE_LOAD_ERROR,
                "template",
                {},
                { suggestions },
            );

            expect(error.suggestions).toHaveLength(2);
            expect(error.suggestions?.[0].type).toBe("fix");
            expect(error.suggestions?.[1].command).toBe("doki check");
        });

        it("should create error with cause", () => {
            const cause = new Error("Original error");
            const error = createCliError(
                CliErrorCode.CONTENT_PARSE_ERROR,
                "content",
                {},
                { cause },
            );

            expect(error.cause).toBe(cause);
        });

        it("should use default severity from error code meta", () => {
            const error = createCliError(
                CliErrorCode.MARKDOWN_ERROR,
                "content",
            );
            expect(error.severity).toBe("warning");
        });
    });

    describe("configNotFoundError()", () => {
        it("should create config not found error", () => {
            const error = configNotFoundError("/path/to/doki.toml");

            expect(error.code).toBe(CliErrorCode.CONFIG_NOT_FOUND);
            expect(error.type).toBe("config");
            expect(error.title).toBe("配置文件未找到");
            expect(error.filePath).toBe("/path/to/doki.toml");
        });

        it("should include helpful suggestions", () => {
            const error = configNotFoundError("./doki.toml");

            expect(error.suggestions).toBeDefined();
            expect(error.suggestions?.length).toBeGreaterThan(0);
            expect(error.suggestions?.some((s) => s.type === "command")).toBe(
                true,
            );
        });
    });

    describe("configParseError()", () => {
        it("should create config parse error", () => {
            const error = configParseError(
                "/path/to/doki.toml",
                "Unexpected character at line 5",
            );

            expect(error.code).toBe(CliErrorCode.CONFIG_PARSE_ERROR);
            expect(error.type).toBe("config");
            expect(error.filePath).toBe("/path/to/doki.toml");
            expect(error.message).toContain("Unexpected character at line 5");
        });
    });

    describe("templateParseError()", () => {
        it("should create template parse error from basic error", () => {
            const originalError = new Error("Unexpected token");
            const error = templateParseError(
                "/templates/layout.html",
                originalError,
            );

            expect(error.code).toBe(CliErrorCode.UNEXPECTED_TOKEN);
            expect(error.type).toBe("template");
            expect(error.title).toBe("模板解析失败");
            expect(error.filePath).toBe("/templates/layout.html");
            expect(error.cause).toBe(originalError);
        });

        it("should extract structured info from DejaVu error", () => {
            const originalError = new Error("Template error") as any;
            originalError.structured = {
                code: CliErrorCode.UNCLOSED_STRING,
                message: "Unclosed string literal",
                range: {
                    start: { line: 10, column: 5 },
                    end: { line: 10, column: 15 },
                },
                sourceLine: '<div class="test></div>',
                before: ["<div>", "  <div>"],
                after: ["</div>", "</div>"],
                suggestions: [{ message: "Add closing quote" }],
            };

            const error = templateParseError(
                "/templates/page.html",
                originalError,
            );

            expect(error.code).toBe(CliErrorCode.UNCLOSED_STRING);
            expect(error.message).toBe("Unclosed string literal");
            expect(error.line).toBe(10);
            expect(error.column).toBe(5);
            expect(error.sourceContext).toBeDefined();
            expect(error.sourceContext?.lineNumber).toBe(10);
            expect(error.sourceContext?.startColumn).toBe(5);
        });

        it("should include default suggestions for basic error", () => {
            const originalError = new Error("Parse error");
            const error = templateParseError(
                "/templates/test.html",
                originalError,
            );

            expect(error.suggestions).toBeDefined();
            expect(error.suggestions?.length).toBeGreaterThan(0);
        });
    });

    describe("portInUseError()", () => {
        it("should create port in use error", () => {
            const error = portInUseError(3000);

            expect(error.code).toBe(CliErrorCode.PORT_IN_USE);
            expect(error.type).toBe("runtime");
            expect(error.title).toBe("端口已被占用");
            expect(error.message).toContain("3000");
        });

        it("should include command suggestions with alternative port", () => {
            const error = portInUseError(3000);

            expect(error.suggestions).toBeDefined();
            const commandSuggestion = error.suggestions?.find(
                (s) => s.type === "command",
            );
            expect(commandSuggestion).toBeDefined();
            expect(commandSuggestion?.command).toContain("3001");
        });
    });
});

describe("Error Formatting", () => {
    describe("formatCliError()", () => {
        it("should format basic error", () => {
            const error: CliError = {
                type: "config",
                title: "配置错误",
                message: "配置文件格式不正确",
            };

            const formatted = formatCliError(error);

            expect(formatted).toContain("配置错误");
            expect(formatted).toContain("配置文件格式不正确");
        });

        it("should include error code in formatted output", () => {
            const error = createCliError(
                CliErrorCode.CONFIG_NOT_FOUND,
                "config",
            );

            const formatted = formatCliError(error);

            expect(formatted).toContain("[E200]");
        });

        it("should include file location", () => {
            const error: CliError = {
                type: "template",
                title: "模板错误",
                message: "模板解析失败",
                filePath: "/templates/layout.html",
                line: 15,
                column: 10,
            };

            const formatted = formatCliError(error);

            expect(formatted).toContain("/templates/layout.html");
            expect(formatted).toContain("15");
            expect(formatted).toContain("10");
        });

        it("should include source context with pointer", () => {
            const error: CliError = {
                type: "template",
                title: "语法错误",
                message: "未闭合的字符串",
                sourceContext: {
                    before: ["<div>", "  <p>"],
                    line: '    <span class="test>',
                    after: ["    </span>", "  </p>"],
                    lineNumber: 3,
                    startColumn: 10,
                    endColumn: 20,
                },
            };

            const formatted = formatCliError(error);

            expect(formatted).toContain("<div>");
            expect(formatted).toContain('<span class="test>');
            expect(formatted).toContain("^");
        });

        it("should include suggestions in formatted output", () => {
            const error: CliError = {
                type: "config",
                title: "配置错误",
                message: "配置文件未找到",
                suggestions: [
                    { type: "fix", message: "创建配置文件" },
                    {
                        type: "command",
                        message: "初始化项目",
                        command: "doki init",
                    },
                    {
                        type: "reference",
                        message: "查看文档",
                        url: "https://docs.doki.engine",
                    },
                ],
            };

            const formatted = formatCliError(error);

            expect(formatted).toContain("修复建议");
            expect(formatted).toContain("创建配置文件");
            expect(formatted).toContain("doki init");
            expect(formatted).toContain("https://docs.doki.engine");
        });

        it("should include documentation URL", () => {
            const error: CliError = {
                type: "template",
                title: "模板错误",
                message: "模板语法错误",
                documentationUrl: "https://docs.doki.engine/templates",
            };

            const formatted = formatCliError(error);

            expect(formatted).toContain("文档");
            expect(formatted).toContain("https://docs.doki.engine/templates");
        });

        it("should format different severity levels", () => {
            const errorError: CliError = {
                type: "build",
                title: "构建错误",
                message: "构建失败",
                severity: "error",
            };

            const warningError: CliError = {
                type: "build",
                title: "构建警告",
                message: "弃用警告",
                severity: "warning",
            };

            const hintError: CliError = {
                type: "build",
                title: "提示",
                message: "优化建议",
                severity: "hint",
            };

            const formattedError = formatCliError(errorError);
            const formattedWarning = formatCliError(warningError);
            const formattedHint = formatCliError(hintError);

            expect(formattedError).toContain("错误");
            expect(formattedWarning).toContain("警告");
            expect(formattedHint).toContain("提示");
        });

        it("should format source line with column pointer", () => {
            const error: CliError = {
                type: "template",
                title: "错误",
                message: "语法错误",
                sourceLine: "{% if show %}",
                line: 1,
                column: 4,
            };

            const formatted = formatCliError(error);

            expect(formatted).toContain("{% if show %}");
        });
    });
});

describe("Error Suggestions", () => {
    describe("getSuggestions()", () => {
        it("should return suggestions for valid error code", () => {
            const suggestions = getSuggestions(CliErrorCode.CONFIG_NOT_FOUND);

            expect(suggestions.length).toBeGreaterThan(0);
            expect(suggestions[0].type).toBeDefined();
            expect(suggestions[0].message).toBeDefined();
        });

        it("should return empty array for unknown error code", () => {
            const suggestions = getSuggestions("UNKNOWN_CODE" as CliErrorCode);
            expect(suggestions).toEqual([]);
        });

        it("should return suggestions with commands", () => {
            const suggestions = getSuggestions(CliErrorCode.PORT_IN_USE);

            const commandSuggestion = suggestions.find(
                (s) => s.type === "command",
            );
            expect(commandSuggestion).toBeDefined();
            expect(commandSuggestion?.command).toBeDefined();
        });

        it("should return suggestions with URLs", () => {
            const suggestions = getSuggestions(CliErrorCode.UNDEFINED_VARIABLE);

            expect(suggestions.length).toBeGreaterThan(0);
        });
    });

    describe("getSuggestionTemplate()", () => {
        it("should return full template for error code", () => {
            const template = getSuggestionTemplate(
                CliErrorCode.CONFIG_PARSE_ERROR,
            );

            expect(template).toBeDefined();
            expect(template?.code).toBe(CliErrorCode.CONFIG_PARSE_ERROR);
            expect(template?.suggestions).toBeDefined();
            expect(template?.documentationUrl).toBeDefined();
        });

        it("should return undefined for unknown error code", () => {
            const template = getSuggestionTemplate("UNKNOWN" as CliErrorCode);
            expect(template).toBeUndefined();
        });
    });

    describe("addCustomSuggestions()", () => {
        it("should add custom suggestions to existing template", () => {
            const originalSuggestions = getSuggestions(
                CliErrorCode.FILE_NOT_FOUND,
            );
            const customSuggestion: ErrorSuggestion = {
                type: "fix",
                message: "Custom fix suggestion",
            };

            addCustomSuggestions(CliErrorCode.FILE_NOT_FOUND, [
                customSuggestion,
            ]);

            const updatedSuggestions = getSuggestions(
                CliErrorCode.FILE_NOT_FOUND,
            );
            expect(updatedSuggestions.length).toBe(
                originalSuggestions.length + 1,
            );
            expect(
                updatedSuggestions.some(
                    (s) => s.message === "Custom fix suggestion",
                ),
            ).toBe(true);
        });
    });

    describe("QUICK_FIXES", () => {
        it("should have configNotFound quick fixes", () => {
            expect(QUICK_FIXES.configNotFound).toBeDefined();
            expect(QUICK_FIXES.configNotFound.length).toBeGreaterThan(0);
        });

        it("should have templateSyntax quick fixes", () => {
            expect(QUICK_FIXES.templateSyntax).toBeDefined();
            expect(QUICK_FIXES.templateSyntax.length).toBeGreaterThan(0);
        });

        it("should have portInUse as function", () => {
            expect(typeof QUICK_FIXES.portInUse).toBe("function");

            const fixes = QUICK_FIXES.portInUse(3000);
            expect(fixes.length).toBeGreaterThan(0);
            expect(fixes[0].command).toContain("3001");
        });

        it("should have permissionDenied quick fixes", () => {
            expect(QUICK_FIXES.permissionDenied).toBeDefined();
            expect(QUICK_FIXES.permissionDenied.length).toBeGreaterThan(0);
        });

        it("should have contentError quick fixes", () => {
            expect(QUICK_FIXES.contentError).toBeDefined();
            expect(QUICK_FIXES.contentError.length).toBeGreaterThan(0);
        });
    });

    describe("diagnoseError()", () => {
        it("should diagnose file not found errors", () => {
            const error = new Error("ENOENT: no such file or directory");
            const diagnosis = diagnoseError(error);

            expect(diagnosis.possibleCauses).toContain("文件或目录不存在");
            expect(diagnosis.suggestedActions.length).toBeGreaterThan(0);
        });

        it("should diagnose permission errors", () => {
            const error = new Error("EACCES: permission denied");
            const diagnosis = diagnoseError(error);

            expect(diagnosis.possibleCauses).toContain("权限不足");
        });

        it("should diagnose port in use errors", () => {
            const error = new Error("EADDRINUSE: port 3000 is already in use");
            const diagnosis = diagnoseError(error);

            expect(diagnosis.possibleCauses).toContain("端口已被占用");
        });

        it("should diagnose parse/syntax errors", () => {
            const error = new Error("Parse error: unexpected token");
            const diagnosis = diagnoseError(error);

            expect(diagnosis.possibleCauses).toContain("语法错误");
        });

        it("should diagnose template errors", () => {
            const error = new Error("Template rendering failed");
            const diagnosis = diagnoseError(error);

            expect(diagnosis.possibleCauses).toContain("模板错误");
        });
    });

    describe("SUGGESTION_TEMPLATES coverage", () => {
        it("should have templates for all error codes", () => {
            const allCodes = Object.values(CliErrorCode);

            for (const code of allCodes) {
                expect(SUGGESTION_TEMPLATES[code]).toBeDefined();
                expect(
                    SUGGESTION_TEMPLATES[code].suggestions.length,
                ).toBeGreaterThan(0);
            }
        });
    });
});

describe("Source Context Extraction", () => {
    describe("extractSourceContext()", () => {
        it("should extract context around error line", () => {
            const source = `line 1
line 2
line 3
line 4
line 5
line 6
line 7`;

            const context = extractSourceContext(source, 4, 3, 7, 2);

            expect(context.lineNumber).toBe(4);
            expect(context.line).toBe("line 4");
            expect(context.startColumn).toBe(3);
            expect(context.endColumn).toBe(7);
            expect(context.before).toEqual(["line 2", "line 3"]);
            expect(context.after).toEqual(["line 5", "line 6"]);
        });

        it("should handle start of file", () => {
            const source = `line 1
line 2
line 3`;

            const context = extractSourceContext(source, 1, 1, 5, 2);

            expect(context.lineNumber).toBe(1);
            expect(context.line).toBe("line 1");
            expect(context.before).toEqual([]);
            expect(context.after).toEqual(["line 2", "line 3"]);
        });

        it("should handle end of file", () => {
            const source = `line 1
line 2
line 3`;

            const context = extractSourceContext(source, 3, 1, 5, 2);

            expect(context.lineNumber).toBe(3);
            expect(context.line).toBe("line 3");
            expect(context.before).toEqual(["line 1", "line 2"]);
            expect(context.after).toEqual([]);
        });

        it("should use default endColumn if not provided", () => {
            const source = "test line";
            const context = extractSourceContext(source, 1, 5);

            expect(context.endColumn).toBe(6);
        });

        it("should handle single line source", () => {
            const source = "single line";
            const context = extractSourceContext(source, 1, 1, 6);

            expect(context.line).toBe("single line");
            expect(context.before).toEqual([]);
            expect(context.after).toEqual([]);
        });
    });

    describe("extractSourceContextFromSource()", () => {
        it("should extract context with SourceRange", () => {
            const source = `first line
second line
third line
fourth line
fifth line`;

            const range = {
                start: { line: 3, column: 1 },
                end: { line: 3, column: 6 },
            };

            const context = extractSourceContextFromSource(source, range, 1);

            expect(context.lineNumber).toBe(3);
            expect(context.line).toBe("third line");
            expect(context.startColumn).toBe(1);
            expect(context.endColumn).toBe(6);
            expect(context.before).toEqual(["second line"]);
            expect(context.after).toEqual(["fourth line"]);
        });

        it("should handle multi-line range", () => {
            const source = `line 1
line 2
line 3
line 4
line 5`;

            const range = {
                start: { line: 2, column: 1 },
                end: { line: 4, column: 6 },
            };

            const context = extractSourceContextFromSource(source, range, 1);

            expect(context.lineNumber).toBe(2);
            expect(context.line).toBe("line 2");
        });
    });
});

describe("Error Chain", () => {
    describe("buildErrorChain()", () => {
        it("should build chain from single error", () => {
            const error: CliError = {
                type: "template",
                title: "模板错误",
                message: "解析失败",
            };

            const chain = buildErrorChain(error);

            expect(chain.error).toBe(error);
            expect(chain.depth).toBe(0);
            expect(chain.cause).toBeUndefined();
        });

        it("should build chain with cause", () => {
            const cause = new Error("Original error");
            const error: CliError = {
                type: "template",
                title: "模板错误",
                message: "解析失败",
                cause,
            };

            const chain = buildErrorChain(error);

            expect(chain.error).toBe(error);
            expect(chain.depth).toBe(0);
            expect(chain.cause).toBeDefined();
            expect(chain.cause?.depth).toBe(1);
        });

        it("should build deep chain", () => {
            const deepCause = new Error("Deep cause");
            const midCause = new Error("Mid cause") as any;
            midCause.cause = deepCause;
            const topCause = new Error("Top cause") as any;
            topCause.cause = midCause;

            const error: CliError = {
                type: "build",
                title: "构建错误",
                message: "构建失败",
                cause: topCause,
            };

            const chain = buildErrorChain(error);

            expect(chain.depth).toBe(0);
            expect(chain.cause?.depth).toBe(1);
            expect(chain.cause?.cause?.depth).toBe(2);
        });

        it("should handle DejaVu structured errors", () => {
            const dejavuError = new Error("DejaVu error") as any;
            dejavuError.structured = {
                code: CliErrorCode.UNEXPECTED_TOKEN,
                message: "Unexpected token",
            };

            const error: CliError = {
                type: "template",
                title: "模板错误",
                message: "解析失败",
                cause: dejavuError,
            };

            const chain = buildErrorChain(error);

            expect(chain.cause).toBeDefined();
        });
    });

    describe("collectErrorsFromChain()", () => {
        it("should collect all errors from chain", () => {
            const cause = new Error("Cause error");
            const error: CliError = {
                type: "template",
                title: "主错误",
                message: "主错误消息",
                cause,
            };

            const chain = buildErrorChain(error);
            const errors = collectErrorsFromChain(chain);

            expect(errors.length).toBe(2);
            expect(errors[0].title).toBe("主错误");
        });

        it("should handle single error chain", () => {
            const error: CliError = {
                type: "config",
                title: "配置错误",
                message: "配置无效",
            };

            const chain = buildErrorChain(error);
            const errors = collectErrorsFromChain(chain);

            expect(errors.length).toBe(1);
        });
    });

    describe("getErrorChainDepth()", () => {
        it("should return 1 for single error", () => {
            const error: CliError = {
                type: "build",
                title: "错误",
                message: "消息",
            };

            const chain = buildErrorChain(error);
            expect(getErrorChainDepth(chain)).toBe(1);
        });

        it("should return correct depth for chain", () => {
            const cause = new Error("Cause");
            const error: CliError = {
                type: "build",
                title: "错误",
                message: "消息",
                cause,
            };

            const chain = buildErrorChain(error);
            expect(getErrorChainDepth(chain)).toBe(2);
        });
    });
});

describe("Error Code System", () => {
    describe("getErrorCodeMeta()", () => {
        it("should return metadata for valid error code", () => {
            const meta = getErrorCodeMeta(CliErrorCode.CONFIG_NOT_FOUND);

            expect(meta).toBeDefined();
            expect(meta?.code).toBe(CliErrorCode.CONFIG_NOT_FOUND);
            expect(meta?.title).toBe("配置文件未找到");
            expect(meta?.severity).toBe("error");
            expect(meta?.recoverable).toBe(true);
        });

        it("should return metadata for all error codes", () => {
            const allCodes = Object.values(CliErrorCode);

            for (const code of allCodes) {
                const meta = getErrorCodeMeta(code);
                expect(meta).toBeDefined();
                expect(meta?.code).toBe(code);
            }
        });
    });

    describe("formatDescription()", () => {
        it("should format description with params", () => {
            const description = formatDescription(CliErrorCode.FILE_NOT_FOUND, {
                path: "/test/file.txt",
            });

            expect(description).toContain("/test/file.txt");
        });

        it("should return default description without params", () => {
            const description = formatDescription(CliErrorCode.PORT_IN_USE);

            expect(description).toContain("端口");
        });

        it("should handle unknown error code", () => {
            const description = formatDescription("UNKNOWN" as CliErrorCode);
            expect(description).toContain("未知错误");
        });
    });

    describe("isRecoverable()", () => {
        it("should return true for recoverable errors", () => {
            expect(isRecoverable(CliErrorCode.CONFIG_NOT_FOUND)).toBe(true);
            expect(isRecoverable(CliErrorCode.FILE_NOT_FOUND)).toBe(true);
        });

        it("should return false for non-recoverable errors", () => {
            expect(isRecoverable(CliErrorCode.CIRCULAR_REFERENCE)).toBe(false);
        });
    });

    describe("getDocumentationUrl()", () => {
        it("should return documentation URL for error code", () => {
            const url = getDocumentationUrl(CliErrorCode.CONFIG_NOT_FOUND);
            expect(url).toBe("https://docs.doki.engine/config");
        });

        it("should return undefined for unknown error code", () => {
            const url = getDocumentationUrl("UNKNOWN" as CliErrorCode);
            expect(url).toBeUndefined();
        });
    });

    describe("ErrorCodeMeta completeness", () => {
        it("should have metadata for all error codes", () => {
            const allCodes = Object.values(CliErrorCode);

            for (const code of allCodes) {
                expect(ErrorCodeMeta[code]).toBeDefined();
                expect(ErrorCodeMeta[code].title).toBeDefined();
                expect(ErrorCodeMeta[code].description).toBeDefined();
                expect(ErrorCodeMeta[code].severity).toBeDefined();
            }
        });
    });
});

describe("Error Report", () => {
    describe("createErrorReport()", () => {
        it("should create report from errors", () => {
            const errors: CliError[] = [
                { type: "config", title: "错误1", message: "消息1" },
                { type: "template", title: "错误2", message: "消息2" },
                { type: "config", title: "错误3", message: "消息3" },
            ];

            const report = createErrorReport(errors);

            expect(report.total).toBe(3);
            expect(report.byType.config.length).toBe(2);
            expect(report.byType.template.length).toBe(1);
        });

        it("should detect fatal errors", () => {
            const errors: CliError[] = [
                {
                    type: "config",
                    title: "错误1",
                    message: "消息1",
                    severity: "error",
                },
                {
                    type: "template",
                    title: "警告",
                    message: "消息2",
                    severity: "warning",
                },
            ];

            const report = createErrorReport(errors);
            expect(report.hasFatal).toBe(true);
        });

        it("should handle empty errors", () => {
            const report = createErrorReport([]);

            expect(report.total).toBe(0);
            expect(report.hasFatal).toBe(false);
        });
    });
});

describe("Error Grouping", () => {
    describe("groupErrorsByFile()", () => {
        it("should group errors by file", () => {
            const errors: CliError[] = [
                {
                    type: "template",
                    title: "错误1",
                    message: "消息1",
                    filePath: "/file1.html",
                },
                {
                    type: "template",
                    title: "错误2",
                    message: "消息2",
                    filePath: "/file2.html",
                },
                {
                    type: "template",
                    title: "错误3",
                    message: "消息3",
                    filePath: "/file1.html",
                },
            ];

            const groups = groupErrorsByFile(errors);

            expect(groups.size).toBe(2);
            expect(groups.get("/file1.html")?.related.length).toBe(1);
            expect(groups.get("/file2.html")?.related.length).toBe(0);
        });

        it("should handle errors without file path", () => {
            const errors: CliError[] = [
                { type: "config", title: "错误1", message: "消息1" },
            ];

            const groups = groupErrorsByFile(errors);

            expect(groups.has("<unknown>")).toBe(true);
        });
    });

    describe("groupErrorsByType()", () => {
        it("should group errors by type", () => {
            const errors: CliError[] = [
                { type: "config", title: "错误1", message: "消息1" },
                { type: "template", title: "错误2", message: "消息2" },
                { type: "config", title: "错误3", message: "消息3" },
            ];

            const groups = groupErrorsByType(errors);

            expect(groups.size).toBe(2);
            expect(groups.get("config")?.related.length).toBe(1);
            expect(groups.get("template")?.related.length).toBe(0);
        });
    });
});

describe("Error Summary", () => {
    describe("createErrorSummary()", () => {
        it("should create summary from errors", () => {
            const errors: CliError[] = [
                {
                    type: "config",
                    title: "错误1",
                    message: "消息1",
                    filePath: "/file1.toml",
                },
                {
                    type: "template",
                    title: "错误2",
                    message: "消息2",
                    filePath: "/file2.html",
                },
                {
                    type: "config",
                    title: "错误3",
                    message: "消息3",
                    filePath: "/file1.toml",
                },
            ];

            const summary = createErrorSummary(errors);

            expect(summary.total).toBe(3);
            expect(summary.byType["config"]).toBe(2);
            expect(summary.byType["template"]).toBe(1);
            expect(summary.byFile["/file1.toml"]).toBe(2);
            expect(summary.byFile["/file2.html"]).toBe(1);
        });

        it("should detect fatal errors", () => {
            const errors: CliError[] = [
                {
                    type: "config",
                    title: "错误",
                    message: "消息",
                    severity: "error",
                },
            ];

            const summary = createErrorSummary(errors);
            expect(summary.hasFatal).toBe(true);
        });
    });
});

describe("DejaVu Error Detection", () => {
    describe("isDejavuError()", () => {
        it("should return true for DejaVu errors", () => {
            const error = new Error("DejaVu error") as any;
            error.structured = { message: "Structured error" };

            expect(isDejavuError(error)).toBe(true);
        });

        it("should return false for regular errors", () => {
            const error = new Error("Regular error");
            expect(isDejavuError(error)).toBe(false);
        });

        it("should return true for null structured (null !== undefined)", () => {
            const error = new Error("Error") as any;
            error.structured = null;

            expect(isDejavuError(error)).toBe(true);
        });
    });

    describe("extractDejavuErrorInfo()", () => {
        it("should extract info from DejaVu error", () => {
            const error = new Error("DejaVu error") as any;
            error.structured = {
                code: CliErrorCode.UNEXPECTED_TOKEN,
                message: "Unexpected token",
                range: {
                    start: { line: 1, column: 1 },
                    end: { line: 1, column: 5 },
                },
                sourceLine: "{% test %}",
                suggestions: [{ message: "Fix it" }],
            };

            const info = extractDejavuErrorInfo(error);

            expect(info).toBeDefined();
            expect(info?.code).toBe(CliErrorCode.UNEXPECTED_TOKEN);
            expect(info?.message).toBe("Unexpected token");
            expect(info?.range).toBeDefined();
            expect(info?.sourceLine).toBe("{% test %}");
        });

        it("should return null for non-DejaVu error", () => {
            const error = new Error("Regular error");
            const info = extractDejavuErrorInfo(error);

            expect(info).toBeNull();
        });
    });
});

describe("ErrorContextEnhancer", () => {
    describe("enhance()", () => {
        it("should return error unchanged if already has context", async () => {
            const enhancer = new ErrorContextEnhancer();
            const error: CliError = {
                type: "template",
                title: "错误",
                message: "消息",
                sourceContext: {
                    before: [],
                    line: "test",
                    after: [],
                    lineNumber: 1,
                    startColumn: 1,
                    endColumn: 5,
                },
            };

            const enhanced = await enhancer.enhance(error);
            expect(enhanced).toBe(error);
        });

        it("should return error unchanged if no file path", async () => {
            const enhancer = new ErrorContextEnhancer();
            const error: CliError = {
                type: "config",
                title: "错误",
                message: "消息",
            };

            const enhanced = await enhancer.enhance(error);
            expect(enhanced).toBe(error);
        });
    });

    describe("clearCache()", () => {
        it("should clear file cache", () => {
            const enhancer = new ErrorContextEnhancer();
            enhancer.clearCache();
        });
    });
});

describe("Error Type Coverage", () => {
    it("should support all error types", () => {
        const types: Array<
            "config" | "template" | "content" | "io" | "build" | "runtime"
        > = ["config", "template", "content", "io", "build", "runtime"];

        for (const type of types) {
            const error: CliError = {
                type,
                title: `${type} 错误`,
                message: "测试消息",
            };

            const formatted = formatCliError(error);
            expect(formatted).toContain("错误");
        }
    });
});

describe("Error Severity Coverage", () => {
    it("should support all severity levels", () => {
        const severities: ErrorSeverity[] = ["error", "warning", "hint"];

        for (const severity of severities) {
            const error: CliError = {
                type: "build",
                title: "错误",
                message: "消息",
                severity,
            };

            const formatted = formatCliError(error);
            expect(formatted).toBeDefined();
        }
    });
});
