/**
 * Doki LSP - Language Server Protocol 实现
 * 基于 DejaVu Engine 的模板语言支持
 *
 * ARCHITECTURE (single language contract / single execution path):
 *   source → parseToIr → IrDocument → LSP features
 * Same parser and inheritance inputs as runtime renderIr + TemplateLoader.
 *
 * Forbidden:
 *   - Expanding Program.body / NodeType DFS (collectBlocks, buildSymbolTable*)
 *   - A parallel delimiter mini-engine that invents control/inheritance semantics
 *
 * Prefer `./template` thin IR adapters (facts / cursor UX). Delimiter scan is
 * offset UX only — never a second semantic model.
 */

import { DejavuLanguage, type IrDocument } from "@doki-land/dejavu-engine";
import {
    type CodeAction,
    type CodeActionContext,
    CodeActionKind,
    type CompletionItem,
    CompletionItemKind,
    createConnection,
    type Definition,
    type Diagnostic,
    DiagnosticRelatedInformation,
    DiagnosticSeverity,
    type DidChangeTextDocumentParams,
    type DocumentFormattingParams,
    type DocumentHighlight,
    DocumentHighlightKind,
    type DocumentRangeFormattingParams,
    DocumentSymbol,
    type Hover,
    type InitializeParams,
    type InitializeResult,
    InsertTextFormat,
    type Location,
    MarkupKind,
    Position,
    ProposedFeatures,
    Range,
    SemanticTokenModifiers,
    SemanticTokensBuilder,
    type SemanticTokensLegend,
    SemanticTokenTypes,
    SymbolKind,
    TextDocuments,
    TextEdit,
    type WorkspaceEdit,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
    analyzeTemplateSource,
    buildParentChain,
    collectStructuralDiagnostics,
    detectCursorContext,
    extractTemplateFacts,
    tryParseToIr,
    walkIr,
} from "./template/index";

/**
 * 错误代码枚举
 */
enum ErrorCode {
    SyntaxError = "E001",
    DelimiterMismatch = "E002",
    UnclosedString = "E003",
    UnclosedComment = "E004",
    UnclosedDelimiter = "E005",
    InvalidIdentifier = "E006",
    InvalidNumber = "E007",
    InvalidExpression = "E008",
    MissingEnd = "E009",
    UndefinedVariable = "E010",
    UndefinedFunction = "E011",
    TemplateNotFound = "E012",
    InvalidAssignment = "E013",
    InvalidOperator = "E014",
    MissingOperator = "E015",
    TypeMismatch = "E016",
    CircularReference = "E017",
}

/**
 * 错误严重程度类型
 */
enum ErrorCategory {
    Error = "Error",
    Warning = "Warning",
    Hint = "Hint",
}

/**
 * 错误信息接口
 */
interface ErrorInfo {
    code: ErrorCode;
    message: string;
    category: ErrorCategory;
    documentationUrl: string;
    fixSuggestion?: string;
}

/**
 * 文档链接基础 URL
 */
const DOCS_BASE_URL = "https://docs.doki.engine/errors";

/**
 * 错误代码文档链接生成器
 * @param errorCode 错误代码
 * @returns 文档链接 URL
 */
function generateDocumentationUrl(errorCode: ErrorCode): string {
    return `${DOCS_BASE_URL}/${errorCode}`;
}

/**
 * 错误代码配置映射
 */
const ERROR_CONFIGS: Record<ErrorCode, ErrorInfo> = {
    [ErrorCode.SyntaxError]: {
        code: ErrorCode.SyntaxError,
        message: "语法错误",
        category: ErrorCategory.Error,
        documentationUrl: generateDocumentationUrl(ErrorCode.SyntaxError),
        fixSuggestion: "请检查语法是否正确，确保所有语句都已正确闭合。",
    },
    [ErrorCode.DelimiterMismatch]: {
        code: ErrorCode.DelimiterMismatch,
        message: "定界符不匹配",
        category: ErrorCategory.Error,
        documentationUrl: generateDocumentationUrl(ErrorCode.DelimiterMismatch),
        fixSuggestion: "确保每个开始定界符都有对应的结束定界符。",
    },
    [ErrorCode.UnclosedString]: {
        code: ErrorCode.UnclosedString,
        message: "未闭合的字符串",
        category: ErrorCategory.Error,
        documentationUrl: generateDocumentationUrl(ErrorCode.UnclosedString),
        fixSuggestion: '添加结束引号 " 来闭合字符串。',
    },
    [ErrorCode.UnclosedComment]: {
        code: ErrorCode.UnclosedComment,
        message: "未闭合的注释",
        category: ErrorCategory.Error,
        documentationUrl: generateDocumentationUrl(ErrorCode.UnclosedComment),
        fixSuggestion: "添加结束标记 #} 来闭合注释。",
    },
    [ErrorCode.UnclosedDelimiter]: {
        code: ErrorCode.UnclosedDelimiter,
        message: "未闭合的定界符",
        category: ErrorCategory.Error,
        documentationUrl: generateDocumentationUrl(ErrorCode.UnclosedDelimiter),
        fixSuggestion: "添加结束标记 %} 来闭合模板代码块。",
    },
    [ErrorCode.InvalidIdentifier]: {
        code: ErrorCode.InvalidIdentifier,
        message: "无效的标识符",
        category: ErrorCategory.Error,
        documentationUrl: generateDocumentationUrl(ErrorCode.InvalidIdentifier),
        fixSuggestion:
            "标识符必须以字母或下划线开头，只能包含字母、数字和下划线。",
    },
    [ErrorCode.InvalidNumber]: {
        code: ErrorCode.InvalidNumber,
        message: "无效的数字",
        category: ErrorCategory.Error,
        documentationUrl: generateDocumentationUrl(ErrorCode.InvalidNumber),
        fixSuggestion: "检查数字格式是否正确。",
    },
    [ErrorCode.InvalidExpression]: {
        code: ErrorCode.InvalidExpression,
        message: "无效的表达式",
        category: ErrorCategory.Error,
        documentationUrl: generateDocumentationUrl(ErrorCode.InvalidExpression),
        fixSuggestion: "请检查表达式语法是否正确。",
    },
    [ErrorCode.MissingEnd]: {
        code: ErrorCode.MissingEnd,
        message: "缺少结束语句",
        category: ErrorCategory.Error,
        documentationUrl: generateDocumentationUrl(ErrorCode.MissingEnd),
        fixSuggestion: "添加对应的 end 语句来闭合代码块。",
    },
    [ErrorCode.UndefinedVariable]: {
        code: ErrorCode.UndefinedVariable,
        message: "未定义的变量",
        category: ErrorCategory.Error,
        documentationUrl: generateDocumentationUrl(ErrorCode.UndefinedVariable),
        fixSuggestion: "在使用变量前，请先使用 `let` 关键字声明变量。",
    },
    [ErrorCode.UndefinedFunction]: {
        code: ErrorCode.UndefinedFunction,
        message: "未定义的函数",
        category: ErrorCategory.Error,
        documentationUrl: generateDocumentationUrl(ErrorCode.UndefinedFunction),
        fixSuggestion: "请确保函数已正确定义，或检查函数名称是否正确。",
    },
    [ErrorCode.TemplateNotFound]: {
        code: ErrorCode.TemplateNotFound,
        message: "模板未找到",
        category: ErrorCategory.Error,
        documentationUrl: generateDocumentationUrl(ErrorCode.TemplateNotFound),
        fixSuggestion: "检查模板名称是否正确，确保模板文件存在。",
    },
    [ErrorCode.InvalidAssignment]: {
        code: ErrorCode.InvalidAssignment,
        message: "无效的赋值",
        category: ErrorCategory.Error,
        documentationUrl: generateDocumentationUrl(ErrorCode.InvalidAssignment),
        fixSuggestion: "只能对变量进行赋值操作。",
    },
    [ErrorCode.InvalidOperator]: {
        code: ErrorCode.InvalidOperator,
        message: "无效的运算符",
        category: ErrorCategory.Error,
        documentationUrl: generateDocumentationUrl(ErrorCode.InvalidOperator),
        fixSuggestion: "检查运算符使用是否正确。",
    },
    [ErrorCode.MissingOperator]: {
        code: ErrorCode.MissingOperator,
        message: "缺少运算符",
        category: ErrorCategory.Error,
        documentationUrl: generateDocumentationUrl(ErrorCode.MissingOperator),
        fixSuggestion: "在两个表达式之间添加运算符。",
    },
    [ErrorCode.TypeMismatch]: {
        code: ErrorCode.TypeMismatch,
        message: "类型不匹配",
        category: ErrorCategory.Warning,
        documentationUrl: generateDocumentationUrl(ErrorCode.TypeMismatch),
        fixSuggestion: "请检查操作数的类型是否兼容。",
    },
    [ErrorCode.CircularReference]: {
        code: ErrorCode.CircularReference,
        message: "循环引用",
        category: ErrorCategory.Error,
        documentationUrl: generateDocumentationUrl(ErrorCode.CircularReference),
        fixSuggestion: "检测到循环引用，请检查模板继承链。",
    },
};

/**
 * 内置函数参数文档接口
 */
interface BuiltinParamDoc {
    /** 参数名称 */
    name: string;
    /** 参数类型 */
    type: string;
    /** 参数描述 */
    description: string;
}

/**
 * 内置函数文档接口
 */
interface BuiltinFunctionDoc {
    /** 函数名称 */
    name: string;
    /** 函数签名 */
    signature: string;
    /** 函数描述 */
    description: string;
    /** 参数列表 */
    parameters: BuiltinParamDoc[];
    /** 返回值类型 */
    returnType: string;
    /** 使用示例 */
    examples: string[];
}

/**
 * 内置函数文档映射表
 */
const BUILTIN_FUNCTIONS: Map<string, BuiltinFunctionDoc> = new Map([
    [
        "len",
        {
            name: "len",
            signature: "len(collection: string |> array |> object) -> number",
            description:
                "返回集合的长度。支持字符串、数组和对象。对于字符串返回字符数，对于数组返回元素数，对于对象返回键的数量。",
            parameters: [
                {
                    name: "collection",
                    type: "string |> array |> object",
                    description: "要计算长度的集合",
                },
            ],
            returnType: "number",
            examples: [
                'len("hello")  // 返回 5',
                "len([1, 2, 3])  // 返回 3",
                'len({"a": 1, "b": 2})  // 返回 2',
            ],
        },
    ],
    [
        "upper",
        {
            name: "upper",
            signature: "upper(str: string) -> string",
            description: "将字符串转换为大写形式。",
            parameters: [
                { name: "str", type: "string", description: "要转换的字符串" },
            ],
            returnType: "string",
            examples: [
                'upper("hello")  // 返回 "HELLO"',
                'upper("Hello World")  // 返回 "HELLO WORLD"',
            ],
        },
    ],
    [
        "lower",
        {
            name: "lower",
            signature: "lower(str: string) -> string",
            description: "将字符串转换为小写形式。",
            parameters: [
                { name: "str", type: "string", description: "要转换的字符串" },
            ],
            returnType: "string",
            examples: [
                'lower("HELLO")  // 返回 "hello"',
                'lower("Hello World")  // 返回 "hello world"',
            ],
        },
    ],
    [
        "trim",
        {
            name: "trim",
            signature: "trim(str: string) -> string",
            description:
                "移除字符串首尾的空白字符（包括空格、制表符、换行符等）。",
            parameters: [
                { name: "str", type: "string", description: "要处理的字符串" },
            ],
            returnType: "string",
            examples: [
                'trim("  hello  ")  // 返回 "hello"',
                'trim("\\n\\ttext\\n")  // 返回 "text"',
            ],
        },
    ],
    [
        "split",
        {
            name: "split",
            signature: "split(str: string, separator: string) -> array",
            description: "使用指定的分隔符将字符串分割成数组。",
            parameters: [
                { name: "str", type: "string", description: "要分割的字符串" },
                { name: "separator", type: "string", description: "分隔符" },
            ],
            returnType: "array",
            examples: [
                'split("a,b,c", ",")  // 返回 ["a", "b", "c"]',
                'split("hello world", " ")  // 返回 ["hello", "world"]',
            ],
        },
    ],
    [
        "join",
        {
            name: "join",
            signature: "join(arr: array, separator: string) -> string",
            description: "使用指定的分隔符将数组元素连接成字符串。",
            parameters: [
                { name: "arr", type: "array", description: "要连接的数组" },
                { name: "separator", type: "string", description: "分隔符" },
            ],
            returnType: "string",
            examples: [
                'join(["a", "b", "c"], ",")  // 返回 "a,b,c"',
                'join([1, 2, 3], "-")  // 返回 "1-2-3"',
            ],
        },
    ],
    [
        "replace",
        {
            name: "replace",
            signature:
                "replace(str: string, search: string, replace: string) -> string",
            description: "在字符串中替换所有匹配的子字符串。",
            parameters: [
                { name: "str", type: "string", description: "原始字符串" },
                {
                    name: "search",
                    type: "string",
                    description: "要查找的子字符串",
                },
                {
                    name: "replace",
                    type: "string",
                    description: "替换后的字符串",
                },
            ],
            returnType: "string",
            examples: [
                'replace("hello world", "world", "doki")  // 返回 "hello doki"',
                'replace("aaa", "a", "b")  // 返回 "bbb"',
            ],
        },
    ],
    [
        "substr",
        {
            name: "substr",
            signature:
                "substr(str: string, start: number, length?: number) -> string",
            description:
                "从字符串中提取子字符串。从指定位置开始，提取指定长度的字符。",
            parameters: [
                { name: "str", type: "string", description: "原始字符串" },
                {
                    name: "start",
                    type: "number",
                    description: "起始位置（从 0 开始）",
                },
                {
                    name: "length",
                    type: "number",
                    description: "可选，提取的长度。省略则提取到字符串末尾",
                },
            ],
            returnType: "string",
            examples: [
                'substr("hello", 1, 3)  // 返回 "ell"',
                'substr("hello", 2)  // 返回 "llo"',
            ],
        },
    ],
    [
        "slice",
        {
            name: "slice",
            signature:
                "slice(collection: string |> array, start: number, end?: number) -> string |> array",
            description:
                "从字符串或数组中提取片段。支持负数索引，表示从末尾开始计算。",
            parameters: [
                {
                    name: "collection",
                    type: "string |> array",
                    description: "原始字符串或数组",
                },
                {
                    name: "start",
                    type: "number",
                    description: "起始位置（包含）",
                },
                {
                    name: "end",
                    type: "number",
                    description: "可选，结束位置（不包含）。省略则到末尾",
                },
            ],
            returnType: "string |> array",
            examples: [
                'slice("hello", 1, 4)  // 返回 "ell"',
                "slice([1, 2, 3, 4, 5], -2)  // 返回 [4, 5]",
            ],
        },
    ],
    [
        "keys",
        {
            name: "keys",
            signature: "keys(obj: object) -> array",
            description: "返回对象所有键组成的数组。",
            parameters: [
                { name: "obj", type: "object", description: "要获取键的对象" },
            ],
            returnType: "array",
            examples: [
                'keys({"a": 1, "b": 2})  // 返回 ["a", "b"]',
                'keys({"name": "doki", "version": 1})  // 返回 ["name", "version"]',
            ],
        },
    ],
    [
        "values",
        {
            name: "values",
            signature: "values(obj: object) -> array",
            description: "返回对象所有值组成的数组。",
            parameters: [
                { name: "obj", type: "object", description: "要获取值的对象" },
            ],
            returnType: "array",
            examples: [
                'values({"a": 1, "b": 2})  // 返回 [1, 2]',
                'values({"x": "foo", "y": "bar"})  // 返回 ["foo", "bar"]',
            ],
        },
    ],
    [
        "items",
        {
            name: "items",
            signature: "items(obj: object) -> array",
            description:
                "返回对象所有键值对组成的数组，每个元素是一个包含键和值的数组。",
            parameters: [
                {
                    name: "obj",
                    type: "object",
                    description: "要获取键值对的对象",
                },
            ],
            returnType: "array",
            examples: [
                'items({"a": 1, "b": 2})  // 返回 [["a", 1], ["b", 2]]',
                'loop (key, value) in items({"x": 1}) { ... }',
            ],
        },
    ],
    [
        "range",
        {
            name: "range",
            signature:
                "range(start: number, end?: number, step?: number) -> range",
            description: "创建一个数字范围。可以指定起始、结束和步长。",
            parameters: [
                {
                    name: "start",
                    type: "number",
                    description: "起始值（或结束值，如果只传一个参数）",
                },
                { name: "end", type: "number", description: "可选，结束值" },
                {
                    name: "step",
                    type: "number",
                    description: "可选，步长，默认为 1",
                },
            ],
            returnType: "range",
            examples: [
                "range(5)  // 返回 0..4 的范围",
                "range(1, 10)  // 返回 1..9 的范围",
                "range(0, 10, 2)  // 返回 0, 2, 4, 6, 8",
            ],
        },
    ],
    [
        "int",
        {
            name: "int",
            signature: "int(value: any) -> number",
            description:
                "将值转换为整数。字符串会被解析为整数，浮点数会被截断。",
            parameters: [
                { name: "value", type: "any", description: "要转换的值" },
            ],
            returnType: "number",
            examples: [
                'int("42")  // 返回 42',
                "int(3.7)  // 返回 3",
                "int(true)  // 返回 1",
            ],
        },
    ],
    [
        "float",
        {
            name: "float",
            signature: "float(value: any) -> number",
            description: "将值转换为浮点数。",
            parameters: [
                { name: "value", type: "any", description: "要转换的值" },
            ],
            returnType: "number",
            examples: [
                'float("3.14")  // 返回 3.14',
                "float(42)  // 返回 42.0",
            ],
        },
    ],
    [
        "str",
        {
            name: "str",
            signature: "str(value: any) -> string",
            description: "将值转换为字符串。",
            parameters: [
                { name: "value", type: "any", description: "要转换的值" },
            ],
            returnType: "string",
            examples: [
                'str(42)  // 返回 "42"',
                'str(true)  // 返回 "true"',
                'str([1, 2, 3])  // 返回 "[1, 2, 3]"',
            ],
        },
    ],
    [
        "bool",
        {
            name: "bool",
            signature: "bool(value: any) -> boolean",
            description:
                "将值转换为布尔值。0、空字符串、空数组、空对象和 null 转换为 false，其他为 true。",
            parameters: [
                { name: "value", type: "any", description: "要转换的值" },
            ],
            returnType: "boolean",
            examples: [
                "bool(0)  // 返回 false",
                "bool(1)  // 返回 true",
                'bool("")  // 返回 false',
                'bool("hello")  // 返回 true',
            ],
        },
    ],
    [
        "list",
        {
            name: "list",
            signature: "list(value: any) -> array",
            description:
                "将值转换为数组。字符串会转换为字符数组，对象会转换为值数组。",
            parameters: [
                { name: "value", type: "any", description: "要转换的值" },
            ],
            returnType: "array",
            examples: [
                'list("hello")  // 返回 ["h", "e", "l", "l", "o"]',
                "list(range(3))  // 返回 [0, 1, 2]",
            ],
        },
    ],
    [
        "dict",
        {
            name: "dict",
            signature: "dict(arr: array) -> object",
            description: "将键值对数组转换为对象。",
            parameters: [
                {
                    name: "arr",
                    type: "array",
                    description: "键值对数组，每个元素为 [key, value] 形式",
                },
            ],
            returnType: "object",
            examples: ['dict([["a", 1], ["b", 2]])  // 返回 {"a": 1, "b": 2}'],
        },
    ],
    [
        "min",
        {
            name: "min",
            signature: "min(...values: number |> array) -> number",
            description: "返回最小值。可以接受多个参数或一个数组。",
            parameters: [
                {
                    name: "values",
                    type: "number |> array",
                    description: "要比较的数值或数值数组",
                },
            ],
            returnType: "number",
            examples: [
                "min(1, 2, 3)  // 返回 1",
                "min([5, 2, 8, 1])  // 返回 1",
            ],
        },
    ],
    [
        "max",
        {
            name: "max",
            signature: "max(...values: number |> array) -> number",
            description: "返回最大值。可以接受多个参数或一个数组。",
            parameters: [
                {
                    name: "values",
                    type: "number |> array",
                    description: "要比较的数值或数值数组",
                },
            ],
            returnType: "number",
            examples: [
                "max(1, 2, 3)  // 返回 3",
                "max([5, 2, 8, 1])  // 返回 8",
            ],
        },
    ],
    [
        "sum",
        {
            name: "sum",
            signature: "sum(arr: array) -> number",
            description: "计算数组中所有数值的总和。",
            parameters: [
                { name: "arr", type: "array", description: "数值数组" },
            ],
            returnType: "number",
            examples: [
                "sum([1, 2, 3, 4, 5])  // 返回 15",
                "sum(range(1, 6))  // 返回 15",
            ],
        },
    ],
    [
        "abs",
        {
            name: "abs",
            signature: "abs(num: number) -> number",
            description: "返回数值的绝对值。",
            parameters: [
                {
                    name: "num",
                    type: "number",
                    description: "要计算绝对值的数值",
                },
            ],
            returnType: "number",
            examples: ["abs(-5)  // 返回 5", "abs(3.14)  // 返回 3.14"],
        },
    ],
    [
        "round",
        {
            name: "round",
            signature: "round(num: number, precision?: number) -> number",
            description: "将数值四舍五入到指定精度。",
            parameters: [
                {
                    name: "num",
                    type: "number",
                    description: "要四舍五入的数值",
                },
                {
                    name: "precision",
                    type: "number",
                    description: "可选，小数位数，默认为 0",
                },
            ],
            returnType: "number",
            examples: [
                "round(3.14159, 2)  // 返回 3.14",
                "round(3.5)  // 返回 4",
            ],
        },
    ],
    [
        "floor",
        {
            name: "floor",
            signature: "floor(num: number) -> number",
            description: "返回小于或等于指定数值的最大整数（向下取整）。",
            parameters: [
                {
                    name: "num",
                    type: "number",
                    description: "要向下取整的数值",
                },
            ],
            returnType: "number",
            examples: ["floor(3.7)  // 返回 3", "floor(-3.2)  // 返回 -4"],
        },
    ],
    [
        "ceil",
        {
            name: "ceil",
            signature: "ceil(num: number) -> number",
            description: "返回大于或等于指定数值的最小整数（向上取整）。",
            parameters: [
                {
                    name: "num",
                    type: "number",
                    description: "要向上取整的数值",
                },
            ],
            returnType: "number",
            examples: ["ceil(3.2)  // 返回 4", "ceil(-3.7)  // 返回 -3"],
        },
    ],
    [
        "sort",
        {
            name: "sort",
            signature: "sort(arr: array, key?: function) -> array",
            description: "对数组进行排序。可以指定排序键函数。",
            parameters: [
                { name: "arr", type: "array", description: "要排序的数组" },
                {
                    name: "key",
                    type: "function",
                    description: "可选，用于提取比较键的函数",
                },
            ],
            returnType: "array",
            examples: [
                "sort([3, 1, 2])  // 返回 [1, 2, 3]",
                'sort(["b", "a", "c"])  // 返回 ["a", "b", "c"]',
            ],
        },
    ],
    [
        "reverse",
        {
            name: "reverse",
            signature: "reverse(arr: array) -> array",
            description: "反转数组元素的顺序。",
            parameters: [
                { name: "arr", type: "array", description: "要反转的数组" },
            ],
            returnType: "array",
            examples: [
                "reverse([1, 2, 3])  // 返回 [3, 2, 1]",
                'reverse("hello")  // 返回 "olleh"',
            ],
        },
    ],
    [
        "map",
        {
            name: "map",
            signature: "map(arr: array, func: function) -> array",
            description: "对数组的每个元素应用函数，返回新数组。",
            parameters: [
                { name: "arr", type: "array", description: "要处理的数组" },
                {
                    name: "func",
                    type: "function",
                    description: "应用于每个元素的函数",
                },
            ],
            returnType: "array",
            examples: [
                "map([1, 2, 3], x => x * 2)  // 返回 [2, 4, 6]",
                'map(["a", "b"], x => upper(x))  // 返回 ["A", "B"]',
            ],
        },
    ],
    [
        "filter",
        {
            name: "filter",
            signature: "filter(arr: array, predicate: function) -> array",
            description: "过滤数组中满足条件的元素，返回新数组。",
            parameters: [
                { name: "arr", type: "array", description: "要过滤的数组" },
                {
                    name: "predicate",
                    type: "function",
                    description: "条件函数，返回 true 则保留元素",
                },
            ],
            returnType: "array",
            examples: [
                "filter([1, 2, 3, 4, 5], x => x > 2)  // 返回 [3, 4, 5]",
                'filter(["a", "bb", "ccc"], x => len(x) > 1)  // 返回 ["bb", "ccc"]',
            ],
        },
    ],
    [
        "reduce",
        {
            name: "reduce",
            signature:
                "reduce(arr: array, func: function, initial?: any) -> any",
            description:
                "将数组归约为单个值。函数接收累加器和当前元素两个参数。",
            parameters: [
                { name: "arr", type: "array", description: "要归约的数组" },
                {
                    name: "func",
                    type: "function",
                    description:
                        "归约函数，接收 (accumulator, current) 两个参数",
                },
                { name: "initial", type: "any", description: "可选，初始值" },
            ],
            returnType: "any",
            examples: [
                "reduce([1, 2, 3], (a, b) => a + b, 0)  // 返回 6",
                'reduce(["a", "b", "c"], (a, b) => a + b)  // 返回 "abc"',
            ],
        },
    ],
    [
        "find",
        {
            name: "find",
            signature: "find(arr: array, predicate: function) -> any",
            description: "查找数组中第一个满足条件的元素。未找到则返回 null。",
            parameters: [
                { name: "arr", type: "array", description: "要搜索的数组" },
                {
                    name: "predicate",
                    type: "function",
                    description: "条件函数",
                },
            ],
            returnType: "any",
            examples: [
                "find([1, 2, 3, 4], x => x > 2)  // 返回 3",
                'find(["apple", "banana"], x => x |> "an")  // 返回 "banana"',
            ],
        },
    ],
    [
        "any",
        {
            name: "any",
            signature: "any(arr: array, predicate?: function) -> boolean",
            description:
                "检查数组中是否有任意元素满足条件。省略条件则检查是否有真值元素。",
            parameters: [
                { name: "arr", type: "array", description: "要检查的数组" },
                {
                    name: "predicate",
                    type: "function",
                    description: "可选，条件函数",
                },
            ],
            returnType: "boolean",
            examples: [
                "any([false, true, false])  // 返回 true",
                "any([1, 2, 3], x => x > 5)  // 返回 false",
            ],
        },
    ],
    [
        "all",
        {
            name: "all",
            signature: "all(arr: array, predicate?: function) -> boolean",
            description:
                "检查数组中是否所有元素都满足条件。省略条件则检查是否所有元素都为真值。",
            parameters: [
                { name: "arr", type: "array", description: "要检查的数组" },
                {
                    name: "predicate",
                    type: "function",
                    description: "可选，条件函数",
                },
            ],
            returnType: "boolean",
            examples: [
                "all([true, true, true])  // 返回 true",
                "all([1, 2, 3], x => x > 0)  // 返回 true",
            ],
        },
    ],
    [
        "enumerate",
        {
            name: "enumerate",
            signature: "enumerate(arr: array, start?: number) -> array",
            description:
                "返回带有索引的元素数组。每个元素为 [index, value] 形式。",
            parameters: [
                { name: "arr", type: "array", description: "要枚举的数组" },
                {
                    name: "start",
                    type: "number",
                    description: "可选，索引起始值，默认为 0",
                },
            ],
            returnType: "array",
            examples: [
                'enumerate(["a", "b", "c"])  // 返回 [[0, "a"], [1, "b"], [2, "c"]]',
                "loop (index, item) in enumerate(list) { ... }",
            ],
        },
    ],
    [
        "zip",
        {
            name: "zip",
            signature: "zip(...arrays: array) -> array",
            description: "将多个数组的对应元素组合成新数组。",
            parameters: [
                {
                    name: "arrays",
                    type: "array",
                    description: "要组合的多个数组",
                },
            ],
            returnType: "array",
            examples: [
                'zip([1, 2, 3], ["a", "b", "c"])  // 返回 [[1, "a"], [2, "b"], [3, "c"]]',
                'loop (num, char) in zip([1, 2], ["a", "b"]) { ... }',
            ],
        },
    ],
]);

/**
 * 过滤器文档接口
 */
interface FilterDoc {
    /** 过滤器名称 */
    name: string;
    /** 过滤器签名 */
    signature: string;
    /** 过滤器描述 */
    description: string;
    /** 参数列表 */
    parameters: BuiltinParamDoc[];
    /** 使用示例 */
    examples: string[];
}

/**
 * 内置过滤器文档映射表
 */
const BUILTIN_FILTERS: Map<string, FilterDoc> = new Map([
    [
        "upper",
        {
            name: "upper",
            signature: "value |> upper",
            description: "将字符串转换为大写形式。",
            parameters: [],
            examples: [
                "{{ name |> upper }}",
                '{{ "hello" |> upper }}  // 输出 HELLO',
            ],
        },
    ],
    [
        "lower",
        {
            name: "lower",
            signature: "value |> lower",
            description: "将字符串转换为小写形式。",
            parameters: [],
            examples: [
                "{{ name |> lower }}",
                '{{ "HELLO" |> lower }}  // 输出 hello',
            ],
        },
    ],
    [
        "capitalize",
        {
            name: "capitalize",
            signature: "value |> capitalize",
            description: "将字符串的首字母转换为大写，其余转换为小写。",
            parameters: [],
            examples: [
                "{{ name |> capitalize }}",
                '{{ "hello WORLD" |> capitalize }}  // 输出 Hello world',
            ],
        },
    ],
    [
        "trim",
        {
            name: "trim",
            signature: "value |> trim",
            description: "移除字符串首尾的空白字符。",
            parameters: [],
            examples: [
                "{{ name |> trim }}",
                '{{ "  hello  " |> trim }}  // 输出 hello',
            ],
        },
    ],
    [
        "strip",
        {
            name: "strip",
            signature: "value |> strip",
            description: "移除字符串首尾的空白字符（trim 的别名）。",
            parameters: [],
            examples: [
                "{{ name |> strip }}",
                '{{ "  hello  " |> strip }}  // 输出 hello',
            ],
        },
    ],
    [
        "length",
        {
            name: "length",
            signature: "value |> length",
            description: "返回字符串、数组或对象的长度。",
            parameters: [],
            examples: [
                "{{ items |> length }}",
                '{{ "hello" |> length }}  // 输出 5',
                "{{ [1, 2, 3] |> length }}  // 输出 3",
            ],
        },
    ],
    [
        "size",
        {
            name: "size",
            signature: "value |> size",
            description: "返回集合的大小（length 的别名）。",
            parameters: [],
            examples: [
                "{{ items |> size }}",
                "{{ [1, 2, 3] |> size }}  // 输出 3",
            ],
        },
    ],
    [
        "default",
        {
            name: "default",
            signature: "value |> default(defaultValue)",
            description: "如果值为 null、undefined 或 falsy，则返回默认值。",
            parameters: [
                { name: "defaultValue", type: "any", description: "默认值" },
            ],
            examples: [
                '{{ name |> default("匿名") }}',
                '{{ user.name |> default("未设置") }}',
            ],
        },
    ],
    [
        "join",
        {
            name: "join",
            signature: "array |> join(separator)",
            description: "使用指定的分隔符将数组元素连接成字符串。",
            parameters: [
                {
                    name: "separator",
                    type: "string",
                    description: "分隔符，默认为空字符串",
                },
            ],
            examples: [
                '{{ items |> join(", ") }}',
                '{{ ["a", "b", "c"] |> join("-") }}  // 输出 a-b-c',
            ],
        },
    ],
    [
        "split",
        {
            name: "split",
            signature: "string |> split(separator)",
            description: "使用指定的分隔符将字符串分割成数组。",
            parameters: [
                { name: "separator", type: "string", description: "分隔符" },
            ],
            examples: [
                '{{ path |> split("/") }}',
                '{{ "a,b,c" |> split(",") }}  // 输出 ["a", "b", "c"]',
            ],
        },
    ],
    [
        "first",
        {
            name: "first",
            signature: "collection |> first",
            description: "返回数组或字符串的第一个元素。",
            parameters: [],
            examples: [
                "{{ items |> first }}",
                "{{ [1, 2, 3] |> first }}  // 输出 1",
                '{{ "hello" |> first }}  // 输出 h',
            ],
        },
    ],
    [
        "last",
        {
            name: "last",
            signature: "collection |> last",
            description: "返回数组或字符串的最后一个元素。",
            parameters: [],
            examples: [
                "{{ items |> last }}",
                "{{ [1, 2, 3] |> last }}  // 输出 3",
                '{{ "hello" |> last }}  // 输出 o',
            ],
        },
    ],
    [
        "reverse",
        {
            name: "reverse",
            signature: "collection |> reverse",
            description: "反转数组或字符串的元素顺序。",
            parameters: [],
            examples: [
                "{{ items |> reverse }}",
                "{{ [1, 2, 3] |> reverse }}  // 输出 [3, 2, 1]",
                '{{ "hello" |> reverse }}  // 输出 olleh',
            ],
        },
    ],
    [
        "sort",
        {
            name: "sort",
            signature: "array |> sort",
            description: "对数组进行升序排序。",
            parameters: [],
            examples: [
                "{{ items |> sort }}",
                "{{ [3, 1, 2] |> sort }}  // 输出 [1, 2, 3]",
            ],
        },
    ],
    [
        "sort_reverse",
        {
            name: "sort_reverse",
            signature: "array |> sort_reverse",
            description: "对数组进行降序排序。",
            parameters: [],
            examples: [
                "{{ items |> sort_reverse }}",
                "{{ [1, 2, 3] |> sort_reverse }}  // 输出 [3, 2, 1]",
            ],
        },
    ],
    [
        "slice",
        {
            name: "slice",
            signature: "collection |> slice(start, end?)",
            description: "提取数组或字符串的片段。",
            parameters: [
                { name: "start", type: "number", description: "起始索引" },
                {
                    name: "end",
                    type: "number",
                    description: "可选，结束索引（不包含）",
                },
            ],
            examples: [
                "{{ items |> slice(1, 3) }}",
                '{{ "hello" |> slice(1, 4) }}  // 输出 ell',
            ],
        },
    ],
    [
        "keys",
        {
            name: "keys",
            signature: "object |> keys",
            description: "返回对象所有键组成的数组。",
            parameters: [],
            examples: [
                "{{ user |> keys }}",
                '{{ {"a": 1, "b": 2} |> keys }}  // 输出 ["a", "b"]',
            ],
        },
    ],
    [
        "values",
        {
            name: "values",
            signature: "object |> values",
            description: "返回对象所有值组成的数组。",
            parameters: [],
            examples: [
                "{{ user |> values }}",
                '{{ {"a": 1, "b": 2} |> values }}  // 输出 [1, 2]',
            ],
        },
    ],
    [
        "escape",
        {
            name: "escape",
            signature: "string |> escape",
            description: "转义 HTML 特殊字符（<, >, &, \", '）。",
            parameters: [],
            examples: [
                "{{ content |> escape }}",
                '{{ "<script>" |> escape }}  // 输出 &lt;script&gt;',
            ],
        },
    ],
    [
        "e",
        {
            name: "e",
            signature: "string |> e",
            description: "转义 HTML 特殊字符（escape 的简写）。",
            parameters: [],
            examples: [
                "{{ content |> e }}",
                '{{ "<div>" |> e }}  // 输出 &lt;div&gt;',
            ],
        },
    ],
    [
        "safe",
        {
            name: "safe",
            signature: "string |> safe",
            description: "标记字符串为安全，不进行 HTML 转义。",
            parameters: [],
            examples: [
                "{{ htmlContent |> safe }}",
                '{{ "<strong>bold</strong>" |> safe }}',
            ],
        },
    ],
    [
        "raw",
        {
            name: "raw",
            signature: "string |> raw",
            description: "输出原始内容，不进行转义（safe 的别名）。",
            parameters: [],
            examples: [
                "{{ content |> raw }}",
                '{{ "<strong>bold</strong>" |> raw }}',
            ],
        },
    ],
    [
        "int",
        {
            name: "int",
            signature: "value |> int",
            description: "将值转换为整数。",
            parameters: [],
            examples: ["{{ price |> int }}", '{{ "42" |> int }}  // 输出 42'],
        },
    ],
    [
        "float",
        {
            name: "float",
            signature: "value |> float",
            description: "将值转换为浮点数。",
            parameters: [],
            examples: [
                "{{ price |> float }}",
                '{{ "3.14" |> float }}  // 输出 3.14',
            ],
        },
    ],
    [
        "string",
        {
            name: "string",
            signature: "value |> string",
            description: "将值转换为字符串。",
            parameters: [],
            examples: [
                "{{ count |> string }}",
                '{{ 42 |> string }}  // 输出 "42"',
            ],
        },
    ],
    [
        "round",
        {
            name: "round",
            signature: "number |> round(precision?)",
            description: "将数字四舍五入到指定精度。",
            parameters: [
                {
                    name: "precision",
                    type: "number",
                    description: "可选，小数位数，默认为 0",
                },
            ],
            examples: [
                "{{ price |> round(2) }}",
                "{{ 3.14159 |> round(2) }}  // 输出 3.14",
            ],
        },
    ],
    [
        "abs",
        {
            name: "abs",
            signature: "number |> abs",
            description: "返回数字的绝对值。",
            parameters: [],
            examples: ["{{ value |> abs }}", "{{ -5 |> abs }}  // 输出 5"],
        },
    ],
    [
        "date",
        {
            name: "date",
            signature: "timestamp |> date(format?)",
            description: "格式化日期时间。支持多种格式化字符串。",
            parameters: [
                {
                    name: "format",
                    type: "string",
                    description: "可选，日期格式，默认为 %Y-%m-%d %H:%M:%S",
                },
            ],
            examples: [
                '{{ page.date |> date("%Y-%m-%d") }}',
                '{{ timestamp |> date("%B %d, %Y") }}',
            ],
        },
    ],
    [
        "truncate",
        {
            name: "truncate",
            signature: "string |> truncate(length, end?)",
            description: "截断字符串到指定长度，并添加省略号。",
            parameters: [
                { name: "length", type: "number", description: "最大长度" },
                {
                    name: "end",
                    type: "string",
                    description: "可选，截断后缀，默认为 ...",
                },
            ],
            examples: [
                "{{ content |> truncate(100) }}",
                '{{ "hello world" |> truncate(5) }}  // 输出 he...',
            ],
        },
    ],
    [
        "wordwrap",
        {
            name: "wordwrap",
            signature: "string |> wordwrap(width?)",
            description: "在指定宽度处换行。",
            parameters: [
                {
                    name: "width",
                    type: "number",
                    description: "可选，每行宽度，默认为 80",
                },
            ],
            examples: [
                "{{ content |> wordwrap(40) }}",
                "{{ longText |> wordwrap }}",
            ],
        },
    ],
    [
        "replace",
        {
            name: "replace",
            signature: "string |> replace(search, replace)",
            description: "替换字符串中的子字符串。",
            parameters: [
                {
                    name: "search",
                    type: "string",
                    description: "要查找的字符串",
                },
                {
                    name: "replace",
                    type: "string",
                    description: "替换后的字符串",
                },
            ],
            examples: [
                '{{ content |> replace("old", "new") }}',
                '{{ "hello world" |> replace("world", "doki") }}',
            ],
        },
    ],
    [
        "title",
        {
            name: "title",
            signature: "string |> title",
            description: "将字符串转换为标题格式（每个单词首字母大写）。",
            parameters: [],
            examples: [
                "{{ title |> title }}",
                '{{ "hello world" |> title }}  // 输出 Hello World',
            ],
        },
    ],
    [
        "strip_tags",
        {
            name: "strip_tags",
            signature: "string |> strip_tags",
            description: "移除字符串中的 HTML 标签。",
            parameters: [],
            examples: [
                "{{ content |> strip_tags }}",
                '{{ "<p>hello</p>" |> strip_tags }}  // 输出 hello',
            ],
        },
    ],
    [
        "unique",
        {
            name: "unique",
            signature: "array |> unique",
            description: "移除数组中的重复元素。",
            parameters: [],
            examples: [
                "{{ items |> unique }}",
                "{{ [1, 2, 2, 3] |> unique }}  // 输出 [1, 2, 3]",
            ],
        },
    ],
    [
        "map",
        {
            name: "map",
            signature: "array |> map(property)",
            description: "提取数组中每个对象的指定属性。",
            parameters: [
                { name: "property", type: "string", description: "属性名" },
            ],
            examples: [
                '{{ users |> map("name") }}',
                '{{ [{"name": "a"}, {"name": "b"}] |> map("name") }}  // 输出 ["a", "b"]',
            ],
        },
    ],
    [
        "reject",
        {
            name: "reject",
            signature: "array |> reject(property)",
            description: "过滤掉数组中指定属性为真值的元素。",
            parameters: [
                { name: "property", type: "string", description: "属性名" },
            ],
            examples: [
                '{{ items |> reject("hidden") }}',
                '{{ posts |> reject("draft") }}',
            ],
        },
    ],
    [
        "select",
        {
            name: "select",
            signature: "array |> select(property)",
            description: "过滤出数组中指定属性为真值的元素。",
            parameters: [
                { name: "property", type: "string", description: "属性名" },
            ],
            examples: [
                '{{ items |> select("active") }}',
                '{{ posts |> select("published") }}',
            ],
        },
    ],
]);

/**
 * 短代码参数文档接口
 */
interface ShortcodeParamDoc {
    /** 参数名称 */
    name: string;
    /** 参数类型 */
    type: string;
    /** 是否必需 */
    required: boolean;
    /** 参数描述 */
    description: string;
    /** 默认值 */
    default?: unknown;
}

/**
 * 短代码文档接口
 */
interface ShortcodeDoc {
    /** 短代码名称 */
    name: string;
    /** 签名 */
    signature: string;
    /** 描述 */
    description: string;
    /** 参数列表 */
    parameters: ShortcodeParamDoc[];
    /** 是否接受内容（块级短代码） */
    acceptsContent: boolean;
    /** 使用示例 */
    examples: string[];
}

/**
 * 内置短代码文档映射表
 */
const _BUILTIN_SHORTCODES: Map<string, ShortcodeDoc> = new Map([
    [
        "image",
        {
            name: "image",
            signature:
                '{% image src="..." alt="..." class="..." lazy=true/false %}',
            description:
                "插入图片标签。支持设置图片源、替代文本、CSS 类名和懒加载属性。",
            parameters: [
                {
                    name: "src",
                    type: "string",
                    required: true,
                    description: "图片 URL 或路径",
                },
                {
                    name: "alt",
                    type: "string",
                    required: true,
                    description: "图片替代文本（无障碍）",
                },
                {
                    name: "class",
                    type: "string",
                    required: false,
                    description: "CSS 类名",
                },
                {
                    name: "lazy",
                    type: "boolean",
                    required: false,
                    description: "是否懒加载",
                    default: true,
                },
            ],
            acceptsContent: false,
            examples: [
                '{% image src="/images/photo.jpg" alt="风景照片" %}',
                '{% image src="/images/logo.png" alt="Logo" class="logo" lazy=true %}',
            ],
        },
    ],
    [
        "youtube",
        {
            name: "youtube",
            signature: '{% youtube id="..." width=560 height=315 %}',
            description: "嵌入 YouTube 视频播放器。支持自定义宽度和高度。",
            parameters: [
                {
                    name: "id",
                    type: "string",
                    required: true,
                    description: "YouTube 视频 ID",
                },
                {
                    name: "width",
                    type: "number",
                    required: false,
                    description: "播放器宽度（像素）",
                    default: 560,
                },
                {
                    name: "height",
                    type: "number",
                    required: false,
                    description: "播放器高度（像素）",
                    default: 315,
                },
            ],
            acceptsContent: false,
            examples: [
                '{% youtube id="dQw4w9WgXcQ" %}',
                '{% youtube id="dQw4w9WgXcQ" width=800 height=450 %}',
            ],
        },
    ],
    [
        "gist",
        {
            name: "gist",
            signature: '{% gist user="..." id="..." %}',
            description: "嵌入 GitHub Gist 代码片段。",
            parameters: [
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
            examples: ['{% gist user="octocat" id="1" %}'],
        },
    ],
    [
        "code",
        {
            name: "code",
            signature: '{% code lang="..." %}内容{% end code %}',
            description: "创建带语法高亮的代码块。支持指定编程语言。",
            parameters: [
                {
                    name: "lang",
                    type: "string",
                    required: false,
                    description: "编程语言",
                    default: "text",
                },
            ],
            acceptsContent: true,
            examples: [
                "{% code lang=\"javascript\" %}\nconst hello = 'world';\n{% end code %}",
                "{% code lang=\"python\" %}\nprint('Hello, World!')\n{% end code %}",
            ],
        },
    ],
    [
        "quote",
        {
            name: "quote",
            signature: '{% quote author="..." %}内容{% end quote %}',
            description: "创建引用块。支持指定引用作者。",
            parameters: [
                {
                    name: "author",
                    type: "string",
                    required: false,
                    description: "引用作者",
                },
            ],
            acceptsContent: true,
            examples: [
                '{% quote author="Albert Einstein" %}\n想象力比知识更重要。\n{% end quote %}',
            ],
        },
    ],
    [
        "figure",
        {
            name: "figure",
            signature: '{% figure caption="..." %}内容{% end figure %}',
            description: "创建图表容器。支持添加说明文字。",
            parameters: [
                {
                    name: "caption",
                    type: "string",
                    required: false,
                    description: "图表说明",
                },
            ],
            acceptsContent: true,
            examples: [
                '{% figure caption="系统架构图" %}\n![架构](/images/arch.png)\n{% end figure %}',
            ],
        },
    ],
]);

/**
 * 模板变量文档接口
 */
interface TemplateVariableDoc {
    /** 变量名称 */
    name: string;
    /** 变量类型 */
    type: string;
    /** 变量描述 */
    description: string;
    /** 子属性 */
    properties?: TemplateVariableDoc[];
    /** 示例 */
    examples?: string[];
}

/**
 * 模板变量定义
 */
const TEMPLATE_VARIABLES: TemplateVariableDoc[] = [
    {
        name: "site",
        type: "object",
        description: "站点配置信息",
        properties: [
            { name: "title", type: "string", description: "站点标题" },
            { name: "url", type: "string", description: "站点 URL" },
            { name: "description", type: "string", description: "站点描述" },
            { name: "author", type: "string", description: "站点作者" },
            { name: "email", type: "string", description: "作者邮箱" },
            { name: "language", type: "string", description: "站点语言" },
            { name: "locale", type: "string", description: "站点区域设置" },
            { name: "keywords", type: "array", description: "站点关键词" },
            { name: "timezone", type: "string", description: "时区设置" },
            { name: "root", type: "string", description: "站点根路径" },
            { name: "base_url", type: "string", description: "基础 URL" },
            { name: "assets_url", type: "string", description: "静态资源 URL" },
            { name: "posts", type: "array", description: "所有文章列表" },
            { name: "pages", type: "array", description: "所有页面列表" },
            { name: "categories", type: "array", description: "所有分类列表" },
            { name: "tags", type: "array", description: "所有标签列表" },
            { name: "data", type: "object", description: "自定义数据文件内容" },
            { name: "time", type: "Date", description: "站点构建时间" },
            { name: "config", type: "object", description: "自定义配置" },
        ],
        examples: [
            "{{ site.title }}",
            "{{ site.url }}",
            "{{ site.description }}",
        ],
    },
    {
        name: "page",
        type: "object",
        description: "当前页面信息",
        properties: [
            { name: "title", type: "string", description: "页面标题" },
            { name: "url", type: "string", description: "页面 URL" },
            { name: "slug", type: "string", description: "URL 别名" },
            { name: "path", type: "string", description: "页面路径" },
            { name: "date", type: "Date", description: "发布日期" },
            { name: "created", type: "Date", description: "创建日期" },
            { name: "modified", type: "Date", description: "修改日期" },
            { name: "updated", type: "Date", description: "更新日期" },
            { name: "content", type: "string", description: "页面内容" },
            { name: "excerpt", type: "string", description: "摘要内容" },
            { name: "author", type: "string", description: "作者" },
            { name: "categories", type: "array", description: "分类列表" },
            { name: "tags", type: "array", description: "标签列表" },
            { name: "layout", type: "string", description: "布局模板" },
            { name: "draft", type: "boolean", description: "是否为草稿" },
            {
                name: "weight",
                type: "number",
                description: "页面权重（用于排序）",
            },
            { name: "type", type: "string", description: "页面类型" },
            { name: "id", type: "string", description: "页面唯一标识" },
            { name: "next", type: "object", description: "下一页信息" },
            { name: "prev", type: "object", description: "上一页信息" },
            { name: "parent", type: "object", description: "父页面信息" },
            { name: "children", type: "array", description: "子页面列表" },
            { name: "toc", type: "string", description: "目录内容" },
            { name: "keywords", type: "array", description: "页面关键词" },
            { name: "description", type: "string", description: "页面描述" },
            { name: "thumbnail", type: "string", description: "缩略图 URL" },
            { name: "comments", type: "boolean", description: "是否启用评论" },
            { name: "published", type: "boolean", description: "是否已发布" },
            {
                name: "reading_time",
                type: "number",
                description: "预计阅读时间（分钟）",
            },
            { name: "word_count", type: "number", description: "字数统计" },
            { name: "metadata", type: "object", description: "页面元数据" },
            { name: "file", type: "object", description: "源文件信息" },
        ],
        examples: [
            "{{ page.title }}",
            '{{ page.date |> date("%Y-%m-%d") }}',
            "{{ page.content }}",
        ],
    },
    {
        name: "data",
        type: "object",
        description: "动态数据对象，用于访问自定义数据文件",
        properties: [
            {
                name: "*",
                type: "any",
                description: "动态数据，根据数据文件内容而定",
            },
        ],
        examples: [
            "{{ data.authors }}",
            "{{ data.config.theme }}",
            "{{ data.nav.links }}",
        ],
    },
    {
        name: "config",
        type: "object",
        description: "全局配置对象",
        properties: [
            {
                name: "env",
                type: "string",
                description: "环境名称（development/production）",
            },
            { name: "debug", type: "boolean", description: "是否调试模式" },
            { name: "version", type: "string", description: "版本号" },
        ],
        examples: ["{{ config.env }}", "{{ config.debug }}"],
    },
    {
        name: "theme",
        type: "object",
        description: "主题配置信息",
        properties: [
            { name: "name", type: "string", description: "主题名称" },
            { name: "version", type: "string", description: "主题版本" },
            { name: "config", type: "object", description: "主题配置" },
        ],
        examples: ["{{ theme.name }}", "{{ theme.config.sidebar }}"],
    },
    {
        name: "paginator",
        type: "object",
        description: "分页信息",
        properties: [
            { name: "current", type: "number", description: "当前页码" },
            { name: "total", type: "number", description: "总页数" },
            { name: "per_page", type: "number", description: "每页数量" },
            { name: "count", type: "number", description: "总条目数" },
            { name: "has_prev", type: "boolean", description: "是否有上一页" },
            { name: "has_next", type: "boolean", description: "是否有下一页" },
            { name: "prev_url", type: "string", description: "上一页 URL" },
            { name: "next_url", type: "string", description: "下一页 URL" },
            { name: "pages", type: "array", description: "页码列表" },
        ],
        examples: [
            "{{ paginator.current }}",
            "{% if paginator.has_next %}...{% end if %}",
        ],
    },
    {
        name: "now",
        type: "Date",
        description: "当前时间",
        examples: ['{{ now |> date("%Y-%m-%d %H:%M:%S") }}'],
    },
    {
        name: "request",
        type: "object",
        description: "请求信息",
        properties: [
            { name: "path", type: "string", description: "请求路径" },
            { name: "query", type: "object", description: "查询参数" },
            { name: "method", type: "string", description: "请求方法" },
            { name: "headers", type: "object", description: "请求头" },
        ],
        examples: ["{{ request.path }}", "{{ request.query.id }}"],
    },
];

/**
 * 补全上下文类型枚举
 */
enum CompletionContextType {
    /** 标签开始位置 */
    TagStart = "TagStart",
    /** 变量位置 */
    VariablePosition = "VariablePosition",
    /** 过滤器位置 */
    FilterPosition = "FilterPosition",
    /** 函数调用位置 */
    FunctionCallPosition = "FunctionCallPosition",
    /** 属性访问位置 */
    PropertyAccessPosition = "PropertyAccessPosition",
    /** 关键字位置 */
    KeywordPosition = "KeywordPosition",
    /** 表达式位置 */
    ExpressionPosition = "ExpressionPosition",
    /** 普通文本 */
    Text = "Text",
}

/**
 * 符号类型枚举
 */
enum SymbolType {
    Variable = "Variable",
    Function = "Function",
    Parameter = "Parameter",
    LoopVariable = "LoopVariable",
    Block = "Block",
    Template = "Template",
}

/**
 * 推断类型枚举
 */
enum InferredType {
    Unknown = "Unknown",
    Number = "Number",
    String = "String",
    Boolean = "Boolean",
    Array = "Array",
    Object = "Object",
    Function = "Function",
    Null = "Null",
    Range = "Range",
    Void = "Void",
}

/**
 * 类型信息接口
 */
interface TypeInfo {
    type: InferredType;
    elementType?: TypeInfo;
    properties?: Map<string, TypeInfo>;
    params?: TypeInfo[];
    returnType?: TypeInfo;
}

/**
 * 符号信息接口
 */
interface SymbolInfo {
    name: string;
    type: SymbolType;
    definitionRange: Range;
    scopeRange: Range;
    references: Range[];
    scopeId: number;
    inferredType?: TypeInfo;
}

/**
 * 作用域接口
 */
interface Scope {
    id: number;
    parentId: number | null;
    range: Range;
    symbols: Map<string, SymbolInfo>;
}

/**
 * 导入信息接口
 */
interface ImportInfo {
    modulePath: string;
    identifiers: string[];
    range: Range;
    resolvedPath?: string;
}

/**
 * 解析结果接口
 */
interface ParseResult {
    /** Normative IR from parseToIr (same path as runtime). */
    ir: IrDocument | null;
    errors: ParseError[];
    symbols: Map<string, SymbolInfo>;
    scopes: Map<number, Scope>;
    rootScopeId: number;
    imports: ImportInfo[];
    extendsTemplate?: string;
}

interface ParseError {
    message: string;
    range: Range;
    code?: ErrorCode;
}

/**
 * 块类型枚举
 */
enum BlockType {
    /** 普通块定义 */
    Block = "block",
    /** 前置追加块 */
    Prepend = "prepend",
    /** 后置追加块 */
    Append = "append",
}

/**
 * 块信息接口
 */
interface BlockInfo {
    /** 块名称 */
    name: string;
    /** 块在文档中的范围 */
    range: Range;
    /** 块类型 */
    type: BlockType;
    /** 块所在的模板路径 */
    templatePath: string;
    /** 块定义所在的行号 */
    line: number;
}

/**
 * 模板继承信息接口
 */
interface TemplateInheritance {
    /** 当前模板路径 */
    templatePath: string;
    /** 继承的父模板路径 */
    extendsTemplate?: string;
    /** 当前模板中定义的块列表 */
    blocks: BlockInfo[];
    /** 完整的父模板链（从当前模板到根模板） */
    parentChain: string[];
}

/**
 * 块继承链项接口
 */
interface BlockChainItem {
    /** 块名称 */
    name: string;
    /** 定义该块的模板路径 */
    templatePath: string;
    /** 块类型 */
    type: BlockType;
    /** 块的范围 */
    range: Range;
    /** 行号 */
    line: number;
}

/**
 * 文件读取器接口
 */
interface FileReader {
    readFile(uri: string): Promise<string | null>;
    resolveUri(baseUri: string, relativePath: string): string | null;
}

/**
 * 模板继承分析器类
 * 负责解析模板继承关系并构建继承层次结构
 */
class TemplateInheritanceAnalyzer {
    /**
     * 文档管理器引用
     */
    private documentManager: DocumentManager;

    /**
     * 文件读取器
     */
    private fileReader: FileReader | null = null;

    /**
     * 构造函数
     * @param documentManager 文档管理器实例
     */
    constructor(documentManager: DocumentManager) {
        this.documentManager = documentManager;
    }

    /**
     * 设置文件读取器
     * @param reader 文件读取器实例
     */
    public setFileReader(reader: FileReader): void {
        this.fileReader = reader;
    }

    /**
     * 分析模板继承信息 — grounded in parseToIr facts (engine path), not NodeType DFS.
     */
    public analyze(
        document: TextDocument,
        cachedDoc: CachedDocument | undefined,
    ): TemplateInheritance {
        const templatePath = document.uri;
        const blocks: BlockInfo[] = [];
        let extendsTemplate: string | undefined;
        const parentChain: string[] = [];

        if (!cachedDoc) {
            return { templatePath, extendsTemplate, blocks, parentChain };
        }

        const ir = cachedDoc.parseResult.ir;
        const language =
            LanguageConfigManager.getInstance().getDejavuLanguage(templatePath);

        if (ir) {
            const facts = extractTemplateFacts(ir);
            extendsTemplate =
                facts.extendsPath ?? cachedDoc.parseResult.extendsTemplate;
            for (const b of facts.blocks) {
                const start = document.positionAt(
                    Math.max(0, Math.min(b.start, document.getText().length)),
                );
                const end = document.positionAt(
                    Math.max(0, Math.min(b.end, document.getText().length)),
                );
                blocks.push({
                    name: b.name,
                    range: Range.create(start, end),
                    type: BlockType.Block,
                    templatePath,
                    line: start.line + 1,
                });
            }
        } else {
            extendsTemplate = cachedDoc.parseResult.extendsTemplate;
            // Prefer re-parse via engine rather than walking legacy Program AST.
            const node = analyzeTemplateSource(
                templatePath,
                cachedDoc.content,
                language,
            );
            extendsTemplate = node.extendsPath ?? extendsTemplate;
            for (const [, def] of node.blocks) {
                const start = document.positionAt(
                    Math.max(0, Math.min(def.start, cachedDoc.content.length)),
                );
                const end = document.positionAt(
                    Math.max(0, Math.min(def.end, cachedDoc.content.length)),
                );
                blocks.push({
                    name: def.name,
                    range: Range.create(start, end),
                    type: BlockType.Block,
                    templatePath,
                    line: start.line + 1,
                });
            }
        }

        if (extendsTemplate) {
            const chain = buildParentChain(
                templatePath,
                (p) => this.readTemplateFile(p) ?? null,
                (from, rel) => this.resolveTemplatePath(rel, from) ?? rel,
                language,
            );
            parentChain.push(...chain);
        }

        return {
            templatePath,
            extendsTemplate,
            blocks,
            parentChain,
        };
    }

    /**
     * 解析模板路径
     * @param templatePath 模板路径
     * @param baseUri 基础 URI
     * @returns 解析后的绝对路径
     */
    private resolveTemplatePath(
        templatePath: string,
        baseUri?: string,
    ): string | undefined {
        if (templatePath.startsWith("file://")) {
            return templatePath;
        }

        if (this.fileReader && baseUri) {
            return (
                this.fileReader.resolveUri(baseUri, templatePath) || undefined
            );
        }

        return undefined;
    }

    /**
     * 读取模板文件内容
     * @param templatePath 模板路径
     * @returns 模板内容或 undefined
     */
    private readTemplateFile(templatePath: string): string | undefined {
        if (this.fileReader) {
            const content = this.fileReader.readFile(templatePath);
            return content as unknown as string;
        }

        const cachedDoc = this.documentManager.getCachedDocument(templatePath);
        if (cachedDoc) {
            return cachedDoc.content;
        }

        return undefined;
    }

    /**
     * 获取指定块在继承链中的完整信息
     * @param blockName 块名称
     * @param currentTemplatePath 当前模板路径
     * @param document 文本文档
     * @param cachedDoc 缓存文档
     * @returns 块继承链项数组
     */
    public getBlockChain(
        blockName: string,
        _currentTemplatePath: string,
        document: TextDocument,
        cachedDoc: CachedDocument | undefined,
    ): BlockChainItem[] {
        const chain: BlockChainItem[] = [];

        if (cachedDoc) {
            const inheritance = this.analyze(document, cachedDoc);
            const currentBlock = inheritance.blocks.find(
                (b) => b.name === blockName,
            );
            if (currentBlock) {
                chain.push({
                    name: currentBlock.name,
                    templatePath: currentBlock.templatePath,
                    type: currentBlock.type,
                    range: currentBlock.range,
                    line: currentBlock.line,
                });
            }

            for (const parentPath of inheritance.parentChain) {
                const parentBlocks = this.getBlocksFromTemplate(parentPath);
                const parentBlock = parentBlocks.find(
                    (b) => b.name === blockName,
                );
                if (parentBlock) {
                    chain.push({
                        name: parentBlock.name,
                        templatePath: parentBlock.templatePath,
                        type: parentBlock.type,
                        range: parentBlock.range,
                        line: parentBlock.line,
                    });
                }
            }
        }

        return chain;
    }

    /**
     * 从模板文件获取块信息
     * @param templatePath 模板路径
     * @returns 块信息数组
     */
    private getBlocksFromTemplate(templatePath: string): BlockInfo[] {
        const blocks: BlockInfo[] = [];
        const content = this.readTemplateFile(templatePath);

        if (!content) {
            return blocks;
        }

        const languageManager = LanguageConfigManager.getInstance();
        const language = languageManager.getDejavuLanguage(templatePath);
        const node = analyzeTemplateSource(templatePath, content, language);
        for (const [, def] of node.blocks) {
            // Approximate range without TextDocument — line from offset
            let line = 1;
            for (let i = 0; i < def.start && i < content.length; i++) {
                if (content.charCodeAt(i) === 10) line++;
            }
            blocks.push({
                name: def.name,
                range: Range.create(
                    Position.create(line - 1, 0),
                    Position.create(line - 1, 0),
                ),
                type: BlockType.Block,
                templatePath,
                line,
            });
        }

        return blocks;
    }

    /**
     * 生成继承层次结构的可显示文本
     * @param inheritance 模板继承信息
     * @returns 格式化的继承层次结构文本
     */
    public formatInheritanceHierarchy(
        inheritance: TemplateInheritance,
    ): string {
        const lines: string[] = [];
        const fileName = this.getFileName(inheritance.templatePath);

        lines.push(`**当前模板**: ${fileName}`);

        if (inheritance.extendsTemplate) {
            lines.push("");
            lines.push("**继承链**:");
            lines.push(`  ${fileName}`);

            for (let i = 0; i < inheritance.parentChain.length; i++) {
                const parentName = this.getFileName(inheritance.parentChain[i]);
                const indent = `  ${"  ".repeat(i + 1)}`;
                lines.push(`${indent}↑ ${parentName}`);
            }
        }

        if (inheritance.blocks.length > 0) {
            lines.push("");
            lines.push("**当前模板定义的块**:");

            const blockGroups = new Map<string, BlockInfo[]>();
            for (const block of inheritance.blocks) {
                const existing = blockGroups.get(block.name) || [];
                existing.push(block);
                blockGroups.set(block.name, existing);
            }

            for (const [name, blockList] of blockGroups) {
                for (const block of blockList) {
                    const typeStr = this.getBlockTypeLabel(block.type);
                    lines.push(
                        `  - \`${name}\` (${typeStr}, 行 ${block.line})`,
                    );
                }
            }
        }

        return lines.join("\n");
    }

    /**
     * 获取块类型标签
     * @param type 块类型
     * @returns 类型标签字符串
     */
    private getBlockTypeLabel(type: BlockType): string {
        switch (type) {
            case BlockType.Block:
                return "定义";
            case BlockType.Prepend:
                return "前置追加";
            case BlockType.Append:
                return "后置追加";
            default:
                return "未知";
        }
    }

    /**
     * 从路径中提取文件名
     * @param path 文件路径
     * @returns 文件名
     */
    private getFileName(path: string): string {
        const parts = path.split(/[/\\]/);
        return parts[parts.length - 1] || path;
    }

    /**
     * 生成块覆盖关系的可显示文本
     * @param blockName 块名称
     * @param chain 块继承链
     * @returns 格式化的块覆盖关系文本
     */
    public formatBlockOverrideChain(
        blockName: string,
        chain: BlockChainItem[],
    ): string {
        if (chain.length === 0) {
            return `**块 \`${blockName}\`**: 未找到继承链信息`;
        }

        const lines: string[] = [];
        lines.push(`**块 \`${blockName}\` 的继承链**:`);
        lines.push("");

        for (let i = 0; i < chain.length; i++) {
            const item = chain[i];
            const indent = "  ".repeat(i);
            const typeLabel = this.getBlockTypeLabel(item.type);
            const fileName = this.getFileName(item.templatePath);

            if (i === 0) {
                lines.push(
                    `${indent}→ ${fileName} (行 ${item.line}) [${typeLabel}]`,
                );
            } else {
                const action =
                    item.type === BlockType.Prepend
                        ? "前置追加"
                        : item.type === BlockType.Append
                          ? "后置追加"
                          : "覆盖";
                lines.push(
                    `${indent}  ↑ 继承自 ${fileName} (行 ${item.line}) [${action}]`,
                );
            }
        }

        return lines.join("\n");
    }
}

class TypeInferer {
    /** Format stored TypeInfo for hover — no Program/NodeType walk. */
    formatTypeInfo(typeInfo: TypeInfo): string {
        switch (typeInfo.type) {
            case InferredType.Number:
                return "number";
            case InferredType.String:
                return "string";
            case InferredType.Boolean:
                return "boolean";
            case InferredType.Array:
                if (typeInfo.elementType) {
                    return `${this.formatTypeInfo(typeInfo.elementType)}[]`;
                }
                return "array";
            case InferredType.Object:
                return "object";
            case InferredType.Function:
                return "function";
            case InferredType.Null:
                return "null";
            case InferredType.Range:
                return "range";
            case InferredType.Void:
                return "void";
            default:
                return "unknown";
        }
    }
}
/**
 * 诊断严重程度配置接口
 */
interface DiagnosticsSeverityConfig {
    syntaxError: DiagnosticSeverity;
    undefinedVariable: DiagnosticSeverity;
    undefinedFunction: DiagnosticSeverity;
    typeMismatch: DiagnosticSeverity;
}

/**
 * 格式化配置接口
 */
interface FormatConfig {
    indentSize: number;
    preserveNewlines: boolean;
}

/**
 * 诊断配置接口
 */
interface DiagnosticsConfig {
    enabled: boolean;
    severity: DiagnosticsSeverityConfig;
}

/**
 * 补全配置接口
 */
interface CompletionConfig {
    enabled: boolean;
    snippets: boolean;
}

/**
 * 模板配置接口
 */
interface TemplatesConfig {
    includes: string[];
}

/**
 * Doki LSP 配置接口
 */
interface DokiConfig {
    format: FormatConfig;
    diagnostics: DiagnosticsConfig;
    completion: CompletionConfig;
    templates: TemplatesConfig;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: DokiConfig = {
    format: {
        indentSize: 2,
        preserveNewlines: true,
    },
    diagnostics: {
        enabled: true,
        severity: {
            syntaxError: DiagnosticSeverity.Error,
            undefinedVariable: DiagnosticSeverity.Warning,
            undefinedFunction: DiagnosticSeverity.Warning,
            typeMismatch: DiagnosticSeverity.Hint,
        },
    },
    completion: {
        enabled: true,
        snippets: true,
    },
    templates: {
        includes: ["templates/**"],
    },
};

/**
 * 配置管理器
 */
class ConfigManager {
    private static instance: ConfigManager;
    private config: DokiConfig;

    private constructor() {
        this.config = { ...DEFAULT_CONFIG };
    }

    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    /**
     * 设置 LSP 连接
     */
    public setConnection(conn: ReturnType<typeof createConnection>): void {
        this.connection = conn;
    }

    /**
     * 获取当前配置
     */
    public getConfig(): DokiConfig {
        return this.config;
    }

    /**
     * 更新配置
     */
    public updateConfig(newConfig: Partial<DokiConfig>): void {
        if (newConfig.format) {
            this.config.format = { ...this.config.format, ...newConfig.format };
        }
        if (newConfig.diagnostics) {
            this.config.diagnostics = {
                ...this.config.diagnostics,
                ...newConfig.diagnostics,
            };
            if (newConfig.diagnostics.severity) {
                this.config.diagnostics.severity = {
                    ...this.config.diagnostics.severity,
                    ...newConfig.diagnostics.severity,
                };
            }
        }
        if (newConfig.completion) {
            this.config.completion = {
                ...this.config.completion,
                ...newConfig.completion,
            };
        }
        if (newConfig.templates) {
            this.config.templates = {
                ...this.config.templates,
                ...newConfig.templates,
            };
        }
    }

    /**
     * 从 VSCode 配置对象解析配置
     */
    public parseFromVscodeConfig(
        vscodeConfig: Record<string, unknown>,
    ): DokiConfig {
        const config: DokiConfig = { ...DEFAULT_CONFIG };

        if (typeof vscodeConfig["doki.format.indentSize"] === "number") {
            config.format.indentSize = vscodeConfig[
                "doki.format.indentSize"
            ] as number;
        }
        if (typeof vscodeConfig["doki.format.preserveNewlines"] === "boolean") {
            config.format.preserveNewlines = vscodeConfig[
                "doki.format.preserveNewlines"
            ] as boolean;
        }
        if (typeof vscodeConfig["doki.diagnostics.enabled"] === "boolean") {
            config.diagnostics.enabled = vscodeConfig[
                "doki.diagnostics.enabled"
            ] as boolean;
        }
        if (
            typeof vscodeConfig["doki.diagnostics.severity"] === "object" &&
            vscodeConfig["doki.diagnostics.severity"] !== null
        ) {
            const severityConfig = vscodeConfig[
                "doki.diagnostics.severity"
            ] as Record<string, string>;
            config.diagnostics.severity = {
                syntaxError: this.parseSeverity(
                    severityConfig.syntaxError,
                    DiagnosticSeverity.Error,
                ),
                undefinedVariable: this.parseSeverity(
                    severityConfig.undefinedVariable,
                    DiagnosticSeverity.Warning,
                ),
                undefinedFunction: this.parseSeverity(
                    severityConfig.undefinedFunction,
                    DiagnosticSeverity.Warning,
                ),
                typeMismatch: this.parseSeverity(
                    severityConfig.typeMismatch,
                    DiagnosticSeverity.Hint,
                ),
            };
        }
        if (typeof vscodeConfig["doki.completion.enabled"] === "boolean") {
            config.completion.enabled = vscodeConfig[
                "doki.completion.enabled"
            ] as boolean;
        }
        if (typeof vscodeConfig["doki.completion.snippets"] === "boolean") {
            config.completion.snippets = vscodeConfig[
                "doki.completion.snippets"
            ] as boolean;
        }
        if (Array.isArray(vscodeConfig["doki.templates.includes"])) {
            config.templates.includes = vscodeConfig[
                "doki.templates.includes"
            ] as string[];
        }

        return config;
    }

    /**
     * 解析严重程度字符串
     */
    private parseSeverity(
        value: string | undefined,
        defaultValue: DiagnosticSeverity,
    ): DiagnosticSeverity {
        if (!value) {
            return defaultValue;
        }
        switch (value) {
            case "error":
                return DiagnosticSeverity.Error;
            case "warning":
                return DiagnosticSeverity.Warning;
            case "hint":
                return DiagnosticSeverity.Hint;
            case "information":
                return DiagnosticSeverity.Information;
            default:
                return defaultValue;
        }
    }

    /**
     * 获取格式化配置
     */
    public getFormatConfig(): FormatConfig {
        return this.config.format;
    }

    /**
     * 获取诊断配置
     */
    public getDiagnosticsConfig(): DiagnosticsConfig {
        return this.config.diagnostics;
    }

    /**
     * 获取补全配置
     */
    public getCompletionConfig(): CompletionConfig {
        return this.config.completion;
    }

    /**
     * 获取模板配置
     */
    public getTemplatesConfig(): TemplatesConfig {
        return this.config.templates;
    }
}

interface LanguageConfig {
    codeStart: string;
    codeEnd: string;
    commentStart: string;
    commentEnd: string;
}

/**
 * 语言配置管理器
 */
class LanguageConfigManager {
    private static instance: LanguageConfigManager;
    private configs: Map<string, LanguageConfig> = new Map();
    private languages: Map<string, DejavuLanguage> = new Map();

    private constructor() {
        const dokiLanguage = new DejavuLanguage().withTemplate({
            codeStart: "{%",
            codeEnd: "%}",
            commentStart: "{#",
            commentEnd: "#}",
        });
        this.configs.set("doki", {
            codeStart: "{%",
            codeEnd: "%}",
            commentStart: "{#",
            commentEnd: "#}",
        });
        this.languages.set("doki", dokiLanguage);

        const dejavuLanguage = new DejavuLanguage().withTemplate({
            codeStart: "<%",
            codeEnd: "%>",
            commentStart: "<#",
            commentEnd: "#>",
        });
        this.configs.set("dejavu", {
            codeStart: "<%",
            codeEnd: "%>",
            commentStart: "<#",
            commentEnd: "#>",
        });
        this.languages.set("dejavu", dejavuLanguage);
    }

    public static getInstance(): LanguageConfigManager {
        if (!LanguageConfigManager.instance) {
            LanguageConfigManager.instance = new LanguageConfigManager();
        }
        return LanguageConfigManager.instance;
    }

    /**
     * 根据文件 URI 获取语言配置
     */
    public getLanguageFromUri(uri: string): LanguageConfig {
        const extension = this.getExtension(uri);
        return this.getLanguage(extension);
    }

    /**
     * 获取 DejavuLanguage 实例
     */
    public getDejavuLanguage(uri: string): DejavuLanguage {
        const extension = this.getExtension(uri);
        const lang = this.languages.get(extension);
        return lang || this.languages.get("doki")!;
    }

    /**
     * 获取文件扩展名
     */
    private getExtension(uri: string): string {
        const parts = uri.split(".");
        return parts.pop() || "doki";
    }

    /**
     * 根据扩展名获取语言配置
     */
    public getLanguage(extension: string): LanguageConfig {
        const config = this.configs.get(extension);
        if (config) {
            return config;
        }
        return this.configs.get("doki")!;
    }

    /**
     * 获取支持的语言 ID 列表
     */
    public getSupportedLanguages(): string[] {
        return ["doki", "dejavu"];
    }
}

/**
 * AST 缓存项
 */
interface CachedDocument {
    /** 文档版本 */
    version: number;
    /** 文档内容 */
    content: string;
    /** 解析结果 */
    parseResult: ParseResult;
    lastAccessed?: number;
}

/**
 * 解析服务类
 */
class ParserService {
    private scopeIdCounter = 0;

    /**
     * Parse via normative parseToIr (same path as runtime). Symbols come from IR facts —
     * not Program.body / NodeType DFS.
     */
    public parseDocument(
        document: TextDocument,
        language: DejavuLanguage,
    ): ParseResult {
        const content = document.getText();
        const errors: ParseError[] = [];
        let ir: IrDocument | null = null;

        const symbols = new Map<string, SymbolInfo>();
        const scopes = new Map<number, Scope>();
        this.scopeIdCounter = 0;

        const rootScopeId = this.scopeIdCounter++;
        const rootScope: Scope = {
            id: rootScopeId,
            parentId: null,
            range: Range.create(
                Position.create(0, 0),
                Position.create(document.lineCount, 0),
            ),
            symbols: new Map(),
        };
        scopes.set(rootScopeId, rootScope);

        const imports: ImportInfo[] = [];
        let extendsTemplate: string | undefined;

        const parsed = tryParseToIr(content, language, document.uri);
        if (parsed.ok) {
            ir = parsed.doc;
            const facts = extractTemplateFacts(ir);
            extendsTemplate = facts.extendsPath;
            for (const inc of facts.includes) {
                imports.push({
                    modulePath: inc,
                    identifiers: [],
                    range: Range.create(
                        Position.create(0, 0),
                        Position.create(0, 1),
                    ),
                });
            }
            this.buildSymbolsFromIr(
                ir,
                content,
                symbols,
                scopes,
                rootScopeId,
                document,
            );
        } else {
            errors.push({
                message: parsed.message,
                range: Range.create(
                    Position.create(0, 0),
                    Position.create(0, 1),
                ),
                code: ErrorCode.SyntaxError,
            });
        }

        return {
            ir,
            errors,
            symbols,
            scopes,
            rootScopeId,
            imports,
            extendsTemplate,
        };
    }

    /** Populate symbols from engine IR (Stmt.Block / Stmt.For) — not VariableDeclaration DFS. */
    private buildSymbolsFromIr(
        ir: IrDocument,
        source: string,
        symbols: Map<string, SymbolInfo>,
        scopes: Map<number, Scope>,
        currentScopeId: number,
        document: TextDocument,
    ): void {
        const facts = extractTemplateFacts(ir);
        for (const b of facts.blocks) {
            const start = document.positionAt(
                Math.max(0, Math.min(b.start, source.length)),
            );
            const end = document.positionAt(
                Math.max(0, Math.min(b.end, source.length)),
            );
            const range = Range.create(start, end);
            const info: SymbolInfo = {
                name: b.name,
                type: SymbolType.Block,
                definitionRange: range,
                scopeRange: range,
                references: [],
                scopeId: currentScopeId,
            };
            const key = `${b.name}@${range.start.line}:${range.start.character}`;
            symbols.set(key, info);
            scopes.get(currentScopeId)?.symbols.set(b.name, info);
        }
        for (const item of facts.loopItems) {
            const start = document.positionAt(
                Math.max(0, Math.min(item.start, source.length)),
            );
            const end = document.positionAt(
                Math.max(0, Math.min(item.end, source.length)),
            );
            const range = Range.create(start, end);
            const info: SymbolInfo = {
                name: item.name,
                type: SymbolType.LoopVariable,
                definitionRange: range,
                scopeRange: range,
                references: [],
                scopeId: currentScopeId,
            };
            const key = `${item.name}@${range.start.line}:${range.start.character}`;
            symbols.set(key, info);
            scopes.get(currentScopeId)?.symbols.set(item.name, info);
        }
    }
}

/**
 * 文档管理器
 */
class DocumentManager {
    private documents: Map<string, CachedDocument> = new Map();
    private parserService: ParserService;
    private languageManager: LanguageConfigManager;
    private maxCacheSize = 50; // 最大缓存文档数量

    constructor() {
        this.parserService = new ParserService();
        this.languageManager = LanguageConfigManager.getInstance();
    }

    /**
     * 解析文档并缓存结果
     */
    public parseDocument(document: TextDocument): CachedDocument {
        const uri = document.uri;
        const content = document.getText();
        const version = document.version;

        const cached = this.documents.get(uri);
        if (
            cached &&
            cached.version === version &&
            cached.content === content
        ) {
            return cached;
        }

        // 检查缓存大小，超过限制时清理最旧的缓存
        if (this.documents.size >= this.maxCacheSize) {
            this.cleanupCache();
        }

        const language = this.languageManager.getDejavuLanguage(uri);
        const parseResult = this.parserService.parseDocument(
            document,
            language,
        );

        const cachedDoc: CachedDocument = {
            version,
            content,
            parseResult,
            lastAccessed: Date.now(),
        };

        this.documents.set(uri, cachedDoc);
        return cachedDoc;
    }

    /**
     * 获取缓存的文档
     */
    public getCachedDocument(uri: string): CachedDocument | undefined {
        const cached = this.documents.get(uri);
        if (cached) {
            // 更新访问时间
            cached.lastAccessed = Date.now();
        }
        return cached;
    }

    /**
     * 清除文档缓存
     */
    public clearDocument(uri: string): void {
        this.documents.delete(uri);
    }

    /**
     * 清理缓存，保留最近访问的文档
     */
    private cleanupCache(): void {
        const entries = Array.from(this.documents.entries());
        entries.sort(
            (a, b) => (a[1].lastAccessed || 0) - (b[1].lastAccessed || 0),
        );

        // 保留前40个最近访问的文档
        const toRemove = entries.slice(0, entries.length - 40);
        toRemove.forEach(([uri]) => {
            this.documents.delete(uri);
        });
    }
}

/**
 * 诊断管理器
 */
class DiagnosticManager {
    private documentManager: DocumentManager;
    private languageManager: LanguageConfigManager;
    private configManager: ConfigManager;

    constructor(documentManager: DocumentManager) {
        this.documentManager = documentManager;
        this.languageManager = LanguageConfigManager.getInstance();
        this.configManager = ConfigManager.getInstance();
    }

    /**
     * 获取文档的诊断信息
     */
    public getDiagnostics(document: TextDocument): Diagnostic[] {
        const diagnosticsConfig = this.configManager.getDiagnosticsConfig();

        if (!diagnosticsConfig.enabled) {
            return [];
        }

        const diagnostics: Diagnostic[] = [];
        const cached = this.documentManager.parseDocument(document);

        // Normative parseToIr diagnostics (same check path as engine).
        diagnostics.push(
            ...this.getTemplateNativeDiagnostics(document, diagnosticsConfig),
        );

        const parserDiagnostics = this.getParserDiagnostics(
            cached.parseResult,
            diagnosticsConfig,
        );
        diagnostics.push(...parserDiagnostics);

        return diagnostics;
    }

    /**
     * Diagnostics from parseToIr via `./template` — not Program AST walk / control-stack scan.
     */
    private getTemplateNativeDiagnostics(
        document: TextDocument,
        diagnosticsConfig: DiagnosticsConfig,
    ): Diagnostic[] {
        const language = this.languageManager.getDejavuLanguage(document.uri);
        const text = document.getText();
        const structural = collectStructuralDiagnostics(
            text,
            language,
            document.uri,
        );

        return structural.map((d) => {
            const start = document.positionAt(
                Math.max(0, Math.min(d.start, text.length)),
            );
            const end = document.positionAt(
                Math.max(0, Math.min(d.end, text.length)),
            );
            const errorCode = ErrorCode.SyntaxError;
            return this.createDiagnostic(
                Range.create(start, end),
                d.message,
                errorCode,
                ErrorCategory.Error,
                diagnosticsConfig,
            );
        });
    }

    /**
     * 获取 Parser 诊断
     */
    private getParserDiagnostics(
        parseResult: ParseResult,
        diagnosticsConfig: DiagnosticsConfig,
    ): Diagnostic[] {
        return parseResult.errors.map((error) => {
            const errorCode = error.code || this.inferErrorCode(error.message);
            const errorConfig = ERROR_CONFIGS[errorCode];

            return this.createDiagnostic(
                error.range,
                error.message,
                errorCode,
                errorConfig?.category || ErrorCategory.Error,
                diagnosticsConfig,
            );
        });
    }

    /**
     * 根据错误消息推断错误代码
     */
    private inferErrorCode(message: string): ErrorCode {
        const lowerMessage = message.toLowerCase();

        if (lowerMessage.includes("语法") || lowerMessage.includes("syntax")) {
            return ErrorCode.SyntaxError;
        }
        if (
            lowerMessage.includes("未定义") ||
            lowerMessage.includes("undefined")
        ) {
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
        if (
            lowerMessage.includes("意外") ||
            lowerMessage.includes("unexpected")
        ) {
            return ErrorCode.SyntaxError;
        }
        if (lowerMessage.includes("缺少") || lowerMessage.includes("missing")) {
            return ErrorCode.MissingEnd;
        }

        return ErrorCode.SyntaxError;
    }

    /**
     * 创建诊断对象
     */
    private createDiagnostic(
        range: Range,
        message: string,
        code: ErrorCode,
        category: ErrorCategory,
        diagnosticsConfig: DiagnosticsConfig,
    ): Diagnostic {
        const errorConfig = ERROR_CONFIGS[code];
        const severity = this.getSeverityForErrorCode(
            code,
            category,
            diagnosticsConfig,
        );

        const diagnostic: Diagnostic = {
            severity,
            range,
            message: `${message} [${code}]`,
            source: "doki-lsp",
            code: code,
            relatedInformation: [
                DiagnosticRelatedInformation.create(
                    { uri: "", range: range },
                    `文档: ${errorConfig.documentationUrl}`,
                ),
            ],
        };

        return diagnostic;
    }

    /**
     * 根据错误代码获取配置的严重程度
     */
    private getSeverityForErrorCode(
        code: ErrorCode,
        category: ErrorCategory,
        diagnosticsConfig: DiagnosticsConfig,
    ): DiagnosticSeverity {
        switch (code) {
            case ErrorCode.SyntaxError:
                return diagnosticsConfig.severity.syntaxError;
            case ErrorCode.UndefinedVariable:
                return diagnosticsConfig.severity.undefinedVariable;
            case ErrorCode.UndefinedFunction:
                return diagnosticsConfig.severity.undefinedFunction;
            case ErrorCode.TypeMismatch:
                return diagnosticsConfig.severity.typeMismatch;
            default:
                return this.mapCategoryToSeverity(category);
        }
    }

    /**
     * 映射错误类别到诊断严重程度
     */
    private mapCategoryToSeverity(category: ErrorCategory): DiagnosticSeverity {
        switch (category) {
            case ErrorCategory.Error:
                return DiagnosticSeverity.Error;
            case ErrorCategory.Warning:
                return DiagnosticSeverity.Warning;
            case ErrorCategory.Hint:
                return DiagnosticSeverity.Hint;
            default:
                return DiagnosticSeverity.Error;
        }
    }
}

/**
 * 补全提供器
 */
class CompletionProvider {
    private configManager: ConfigManager;

    constructor() {
        this.configManager = ConfigManager.getInstance();
    }

    /**
     * 获取补全项
     */
    public getCompletions(
        cachedDoc: CachedDocument | undefined,
        position: Position,
        document?: TextDocument,
    ): CompletionItem[] {
        const completionConfig = this.configManager.getCompletionConfig();

        if (!completionConfig.enabled) {
            return [];
        }

        let contextType = CompletionContextType.Text;
        if (document) {
            contextType = this.detectContext(document, position);
        }

        const completions: CompletionItem[] = [];

        switch (contextType) {
            case CompletionContextType.FilterPosition:
                completions.push(...this.getFilterCompletions());
                break;

            case CompletionContextType.VariablePosition:
            case CompletionContextType.ExpressionPosition:
                completions.push(...this.getTemplateVariableCompletions());
                completions.push(...this.getBuiltinFunctionCompletions());
                if (cachedDoc) {
                    completions.push(
                        ...this.getContextCompletions(cachedDoc, position),
                    );
                }
                break;

            case CompletionContextType.PropertyAccessPosition:
                completions.push(
                    ...this.getPropertyAccessCompletions(document!, position),
                );
                break;

            case CompletionContextType.KeywordPosition:
            case CompletionContextType.TagStart:
                completions.push(...this.getKeywordCompletions());
                if (completionConfig.snippets) {
                    completions.push(...this.getSnippetCompletions());
                    completions.push(...this.getDelimiterCompletions());
                }
                break;

            default:
                completions.push(...this.getKeywordCompletions());
                completions.push(...this.getBuiltinFunctionCompletions());
                completions.push(...this.getTemplateVariableCompletions());
                completions.push(...this.getFilterCompletions());
                if (completionConfig.snippets) {
                    completions.push(...this.getSnippetCompletions());
                    completions.push(...this.getDelimiterCompletions());
                }
                if (cachedDoc) {
                    completions.push(
                        ...this.getContextCompletions(cachedDoc, position),
                    );
                }
        }

        return completions;
    }

    /**
     * 检测当前上下文类型
     */
    private detectContext(
        document: TextDocument,
        position: Position,
    ): CompletionContextType {
        const content = document.getText();
        const offset = document.offsetAt(position);

        // Prefer IR-backed cursor context; delimiter offsets only for incomplete buffers.
        const langMgr = LanguageConfigManager.getInstance();
        const lang = langMgr.getLanguageFromUri(document.uri);
        const dejavuLang = langMgr.getDejavuLanguage(document.uri);
        const native = detectCursorContext(
            content,
            offset,
            {
                codeStart: lang.codeStart,
                codeEnd: lang.codeEnd,
                commentStart: lang.commentStart,
                commentEnd: lang.commentEnd,
            },
            dejavuLang,
        );
        if (native.kind === "filter_pipe") {
            return CompletionContextType.FilterPosition;
        }
        if (
            native.kind === "code_tag_start" ||
            native.kind === "code_keyword"
        ) {
            return CompletionContextType.KeywordPosition;
        }
        if (native.kind === "code_expr" || native.kind === "block_name") {
            return CompletionContextType.ExpressionPosition;
        }

        const lineStart = content.lastIndexOf("\n", offset - 1) + 1;
        const lineEnd = content.indexOf("\n", offset);
        const lineContent = content.substring(
            lineStart,
            lineEnd === -1 ? content.length : lineEnd,
        );
        const cursorPosition = offset - lineStart;

        const beforeCursor = lineContent.substring(0, cursorPosition);

        if (/\|>\s*\w*$/.test(beforeCursor)) {
            return CompletionContextType.FilterPosition;
        }

        if (/\.\w*$/.test(beforeCursor)) {
            return CompletionContextType.PropertyAccessPosition;
        }

        if (
            /\{\{\s*\w*$/.test(beforeCursor) ||
            /\{%\s*\w*$/.test(beforeCursor)
        ) {
            return CompletionContextType.VariablePosition;
        }

        if (/\{%[^%]*$/.test(beforeCursor) && !/%\}/.test(beforeCursor)) {
            return CompletionContextType.KeywordPosition;
        }

        if (/\{\{[^}]*$/.test(beforeCursor) && !/\}\}/.test(beforeCursor)) {
            return CompletionContextType.ExpressionPosition;
        }

        if (/\{%$/.test(beforeCursor) || /\{\{$/.test(beforeCursor)) {
            return CompletionContextType.TagStart;
        }

        const inTag = this.isInsideTag(content, offset);
        if (inTag) {
            return CompletionContextType.ExpressionPosition;
        }

        return CompletionContextType.Text;
    }

    /**
     * 检查位置是否在标签内
     */
    private isInsideTag(content: string, offset: number): boolean {
        let inOutputTag = false;
        let inCodeTag = false;

        for (let i = 0; i < offset; i++) {
            if (content.substring(i, i + 2) === "{{") {
                inOutputTag = true;
                i++;
            } else if (content.substring(i, i + 2) === "}}") {
                inOutputTag = false;
                i++;
            } else if (content.substring(i, i + 2) === "{%") {
                inCodeTag = true;
                i++;
            } else if (content.substring(i, i + 2) === "%}") {
                inCodeTag = false;
                i++;
            }
        }

        return inOutputTag || inCodeTag;
    }

    /**
     * 获取过滤器补全项
     */
    public getFilterCompletions(): CompletionItem[] {
        const completions: CompletionItem[] = [];
        let index = 0;

        BUILTIN_FILTERS.forEach((filterDoc, name) => {
            let docMarkdown = `**${name}** (过滤器)\n\n`;
            docMarkdown += `\`\`\`\n${filterDoc.signature}\n\`\`\`\n\n`;
            docMarkdown += `${filterDoc.description}`;

            if (filterDoc.parameters.length > 0) {
                docMarkdown += "\n\n**参数:**\n";
                filterDoc.parameters.forEach((p) => {
                    docMarkdown += `- \`${p.name}\` (${p.type}): ${p.description}\n`;
                });
            }

            if (filterDoc.examples.length > 0) {
                docMarkdown += "\n\n**示例:**\n";
                filterDoc.examples.forEach((ex) => {
                    docMarkdown += `\`\`\`doki\n${ex}\n\`\`\`\n`;
                });
            }

            const insertText =
                filterDoc.parameters.length > 0
                    ? `${name}(\${1:${filterDoc.parameters[0].name}})`
                    : name;

            completions.push({
                label: name,
                kind: CompletionItemKind.Method,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: docMarkdown,
                },
                detail: `过滤器: ${filterDoc.signature}`,
                sortText: `2${index.toString().padStart(2, "0")}`,
                insertText,
                insertTextFormat: InsertTextFormat.Snippet,
            });
            index++;
        });

        return completions;
    }

    /**
     * 获取模板变量补全项
     */
    public getTemplateVariableCompletions(): CompletionItem[] {
        const completions: CompletionItem[] = [];
        let index = 0;

        TEMPLATE_VARIABLES.forEach((varDoc) => {
            let docMarkdown = `**${varDoc.name}** (${varDoc.type})\n\n`;
            docMarkdown += `${varDoc.description}`;

            if (varDoc.properties && varDoc.properties.length > 0) {
                docMarkdown += "\n\n**属性:**\n";
                varDoc.properties.forEach((prop) => {
                    docMarkdown += `- \`${prop.name}\` (${prop.type}): ${prop.description}\n`;
                });
            }

            if (varDoc.examples && varDoc.examples.length > 0) {
                docMarkdown += "\n\n**示例:**\n";
                varDoc.examples.forEach((ex) => {
                    docMarkdown += `\`\`\`doki\n${ex}\n\`\`\`\n`;
                });
            }

            completions.push({
                label: varDoc.name,
                kind: this.getVariableKind(varDoc.type),
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: docMarkdown,
                },
                detail: `${varDoc.type}: ${varDoc.description}`,
                sortText: `4${index.toString().padStart(2, "0")}`,
                insertText: varDoc.name,
            });

            if (varDoc.properties && varDoc.properties.length > 0) {
                varDoc.properties.forEach((prop, propIndex) => {
                    completions.push({
                        label: `${varDoc.name}.${prop.name}`,
                        kind: this.getVariableKind(prop.type),
                        documentation: {
                            kind: MarkupKind.Markdown,
                            value: `**${varDoc.name}.${prop.name}** (${prop.type})\n\n${prop.description}`,
                        },
                        detail: `${prop.type}: ${prop.description}`,
                        sortText: `4${index.toString().padStart(2, "0")}${propIndex.toString().padStart(2, "0")}`,
                        insertText: `${varDoc.name}.${prop.name}`,
                    });
                });
            }

            index++;
        });

        return completions;
    }

    /**
     * 获取属性访问补全
     */
    private getPropertyAccessCompletions(
        document: TextDocument,
        position: Position,
    ): CompletionItem[] {
        const content = document.getText();
        const offset = document.offsetAt(position);
        const lineStart = content.lastIndexOf("\n", offset - 1) + 1;
        const lineEnd = content.indexOf("\n", offset);
        const lineContent = content.substring(
            lineStart,
            lineEnd === -1 ? content.length : lineEnd,
        );
        const cursorPosition = offset - lineStart;
        const beforeCursor = lineContent.substring(0, cursorPosition);

        const match = beforeCursor.match(/(\w+)\.\w*$/);
        if (!match) {
            return [];
        }

        const objectName = match[1];
        const completions: CompletionItem[] = [];

        const templateVar = TEMPLATE_VARIABLES.find(
            (v) => v.name === objectName,
        );
        if (templateVar?.properties) {
            templateVar.properties.forEach((prop, index) => {
                completions.push({
                    label: prop.name,
                    kind: this.getVariableKind(prop.type),
                    documentation: {
                        kind: MarkupKind.Markdown,
                        value: `**${objectName}.${prop.name}** (${prop.type})\n\n${prop.description}`,
                    },
                    detail: `${prop.type}: ${prop.description}`,
                    sortText: `5${index.toString().padStart(2, "0")}`,
                    insertText: prop.name,
                });
            });
        }

        return completions;
    }

    /**
     * 根据类型获取补全项类型
     */
    private getVariableKind(type: string): CompletionItemKind {
        switch (type.toLowerCase()) {
            case "string":
                return CompletionItemKind.Text;
            case "number":
                return CompletionItemKind.Constant;
            case "boolean":
                return CompletionItemKind.Constant;
            case "array":
                return CompletionItemKind.Class;
            case "object":
                return CompletionItemKind.Class;
            case "function":
                return CompletionItemKind.Function;
            case "date":
                return CompletionItemKind.Constant;
            default:
                return CompletionItemKind.Variable;
        }
    }

    /**
     * 获取上下文感知补全
     */
    public getContextualCompletions(
        cachedDoc: CachedDocument,
        position: Position,
    ): CompletionItem[] {
        const completions: CompletionItem[] = [];
        const symbols = cachedDoc.parseResult.symbols;
        const _scopes = cachedDoc.parseResult.scopes;

        for (const [_key, symbol] of symbols) {
            if (this.isPositionInScope(position, symbol.scopeRange)) {
                completions.push({
                    label: symbol.name,
                    kind: this.getCompletionItemKind(symbol.type),
                    documentation: this.getSymbolDocumentation(symbol),
                    sortText: `3${symbol.name}`,
                });
            }
        }

        return completions;
    }

    /**
     * 获取内置函数补全项
     */
    private getBuiltinFunctionCompletions(): CompletionItem[] {
        const completions: CompletionItem[] = [];
        let index = 0;

        BUILTIN_FUNCTIONS.forEach((funcDoc, name) => {
            let docMarkdown = `**${funcDoc.name}** (内置函数)\n\n`;
            docMarkdown += `\`\`\`\n${funcDoc.signature}\n\`\`\`\n\n`;
            docMarkdown += `${funcDoc.description}`;

            completions.push({
                label: name,
                kind: CompletionItemKind.Function,
                documentation: {
                    kind: MarkupKind.Markdown,
                    value: docMarkdown,
                },
                sortText: `1${index.toString().padStart(2, "0")}`,
                insertText: this.getInsertTextForBuiltin(name, funcDoc),
                insertTextFormat: InsertTextFormat.Snippet,
            });
            index++;
        });

        return completions;
    }

    /**
     * 获取内置函数的插入文本
     */
    private getInsertTextForBuiltin(
        name: string,
        funcDoc: BuiltinFunctionDoc,
    ): string {
        const params = funcDoc.parameters
            .map((p, i) => `\${${i + 1}:${p.name}}`)
            .join(", ");
        return `${name}(${params})`;
    }

    /**
     * 获取关键字补全
     */
    private getKeywordCompletions(): CompletionItem[] {
        const keywords = [
            { name: "let", doc: "声明变量" },
            { name: "if", doc: "条件语句" },
            { name: "else", doc: "否则分支" },
            { name: "else if", doc: "否则如果分支" },
            { name: "loop", doc: "循环语句" },
            { name: "break", doc: "跳出循环" },
            { name: "continue", doc: "继续下一次循环" },
            { name: "micro", doc: "声明微函数" },
            { name: "namespace", doc: "命名空间声明" },
            { name: "using", doc: "导入模块" },
            { name: "match", doc: "模式匹配" },
            { name: "case", doc: "匹配分支" },
            { name: "end", doc: "结束语句块" },
            { name: "end if", doc: "结束 if 语句" },
            { name: "end loop", doc: "结束 loop 语句" },
            { name: "end match", doc: "结束 match 语句" },
            { name: "end micro", doc: "结束 micro 函数" },
            { name: "extends", doc: "模板继承声明" },
            { name: "block", doc: "块声明" },
            { name: "end block", doc: "结束块声明" },
            { name: "prepend", doc: "前置追加块内容" },
            { name: "end prepend", doc: "结束前置追加" },
            { name: "append", doc: "后置追加块内容" },
            { name: "end append", doc: "结束后置追加" },
            { name: "super", doc: "调用父块内容" },
            { name: "true", doc: "布尔值 true" },
            { name: "false", doc: "布尔值 false" },
        ];

        return keywords.map((kw, index) => ({
            label: kw.name,
            kind: CompletionItemKind.Keyword,
            documentation: kw.doc,
            sortText: `0${index.toString().padStart(2, "0")}`,
        }));
    }

    /**
     * 获取代码片段补全
     */
    private getSnippetCompletions(): CompletionItem[] {
        return [
            {
                label: "extends",
                kind: CompletionItemKind.Snippet,
                documentation:
                    '模板继承声明\n\n用于声明当前模板继承自另一个基础模板。\n基础模板中定义的 block 可以在子模板中被重写。\n\n示例:\n{% extends "base.html" %}',
                insertText: '{% extends "${1:base.html}" %}',
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "100",
            },
            {
                label: "block",
                kind: CompletionItemKind.Snippet,
                documentation:
                    "块声明\n\n用于在模板中定义一个可重写的块。\n子模板可以覆盖或追加/前置内容到这个块。\n\n示例:\n{% block content %}\n  <p>默认内容</p>\n{% end block %}",
                insertText: "{% block ${1:name} %}\n\t$0\n{% end block %}",
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "101",
            },
            {
                label: "prepend",
                kind: CompletionItemKind.Snippet,
                documentation:
                    "前置追加块内容\n\n在父模板块内容之前插入内容。\n通常与 {% super %} 配合使用。\n\n示例:\n{% prepend content %}\n  <p>前置内容</p>\n{% end prepend %}",
                insertText: "{% prepend ${1:name} %}\n\t$0\n{% end prepend %}",
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "102",
            },
            {
                label: "append",
                kind: CompletionItemKind.Snippet,
                documentation:
                    "后置追加块内容\n\n在父模板块内容之后插入内容。\n通常与 {% super %} 配合使用。\n\n示例:\n{% append content %}\n  <p>后置内容</p>\n{% end append %}",
                insertText: "{% append ${1:name} %}\n\t$0\n{% end append %}",
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "103",
            },
            {
                label: "super",
                kind: CompletionItemKind.Snippet,
                documentation:
                    "调用父块内容\n\n在 block 重写中插入父模板的块内容。\n常用于 prepend/append 场景。\n\n示例:\n{% block content %}\n  {% super %}\n  <p>额外内容</p>\n{% end block %}",
                insertText: "{% super %}",
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "104",
            },
            {
                label: "if",
                kind: CompletionItemKind.Snippet,
                documentation:
                    "If 条件语句\n\n根据条件判断是否渲染内容。\n条件为真时渲染块内内容。\n\n示例:\n{% if user.isLoggedIn %}\n  <p>欢迎回来!</p>\n{% end if %}",
                insertText: "{% if ${1:condition} %}\n\t$0\n{% end if %}",
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "110",
            },
            {
                label: "ifelse",
                kind: CompletionItemKind.Snippet,
                documentation:
                    "If-Else 条件语句\n\n根据条件判断渲染不同内容。\n条件为真渲染 if 块，否则渲染 else 块。\n\n示例:\n{% if user.isLoggedIn %}\n  <p>欢迎回来!</p>\n{% else %}\n  <p>请先登录</p>\n{% end if %}",
                insertText:
                    "{% if ${1:condition} %}\n\t$2\n{% else %}\n\t$0\n{% end if %}",
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "111",
            },
            {
                label: "loop",
                kind: CompletionItemKind.Snippet,
                documentation:
                    "集合遍历循环\n\n遍历集合中的每个元素。\n\n示例:\n{% loop item in items %}\n  <li>{{ item.name }}</li>\n{% end loop %}",
                insertText:
                    "{% loop ${1:item} in ${2:list} %}\n\t$0\n{% end loop %}",
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "120",
            },
            {
                label: "loopi",
                kind: CompletionItemKind.Snippet,
                documentation:
                    "带索引的集合遍历\n\n遍历集合时同时获取索引和元素。\n\n示例:\n{% loop (index, item) in items %}\n  <li>{{ index }}: {{ item.name }}</li>\n{% end loop %}",
                insertText:
                    "{% loop (${1:index}, ${2:item}) in ${3:list} %}\n\t$0\n{% end loop %}",
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "121",
            },
            {
                label: "match",
                kind: CompletionItemKind.Snippet,
                documentation:
                    'Match 匹配语句\n\n模式匹配语句，根据值匹配不同的 case 分支。\n使用 _ 作为默认匹配（类似 default）。\n\n示例:\n{% match status %}\n  {% case "active" %}激活{% end case %}\n  {% case _ %}未知{% end case %}\n{% end match %}',
                insertText:
                    '{% match ${1:value} %}\n\t{% case "${2:a}" %}$3\n\t{% case _ %}$0\n{% end match %}',
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "130",
            },
            {
                label: "while",
                kind: CompletionItemKind.Snippet,
                documentation:
                    "While 循环语句\n\n当条件为真时重复执行块内内容。\n注意：需要确保条件最终变为假，否则会无限循环。\n\n示例:\n{% while counter > 0 %}\n  <p>计数: {{ counter }}</p>\n  {% let counter = counter - 1 %}\n{% end while %}",
                insertText: "{% while ${1:condition} %}\n\t$0\n{% end while %}",
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "131",
            },
            {
                label: "let",
                kind: CompletionItemKind.Snippet,
                documentation:
                    '变量声明\n\n在模板中声明一个变量。\n变量可以在声明后的作用域内使用。\n\n示例:\n{% let greeting = "Hello, World!" %}\n{% let count = 42 %}\n<p>{{ greeting }}</p>',
                insertText: "{% let ${1:name} = ${2:value} %}$0",
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "140",
            },
            {
                label: "micro",
                kind: CompletionItemKind.Snippet,
                documentation:
                    '微函数声明\n\n定义一个可重用的模板片段（微函数）。\n可以在模板中多次调用。\n\n示例:\n{% macro renderUser(user) %}\n  <div class="user">\n    <span>{{ user.name }}</span>\n  </div>\n{% end macro %}',
                insertText:
                    "{% micro ${1:name}(${2:params}) %}\n\t$0\n{% end micro %}",
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "141",
            },
            {
                label: "namespace",
                kind: CompletionItemKind.Snippet,
                documentation:
                    "命名空间声明\n\n为模板定义命名空间，避免命名冲突。\n命名空间内的定义需要通过完整路径访问。\n\n示例:\n{% namespace admin; %}\n{% micro header() %}...{% end micro %}",
                insertText: "{% namespace ${1:name}; %}",
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "142",
            },
            {
                label: "using",
                kind: CompletionItemKind.Snippet,
                documentation:
                    "导入模块\n\n导入其他模块中的函数或定义。\n导入后可以直接使用，无需完整路径。\n\n示例:\n{% using admin::header; %}\n{% using utils::formatDate; %}",
                insertText: "{% using ${1:module::func}; %}",
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "143",
            },
            {
                label: "filter",
                kind: CompletionItemKind.Snippet,
                documentation:
                    "过滤器表达式\n\n对值应用过滤器进行转换。\n支持链式调用多个过滤器。\n\n示例:\n{{ name |> upper }}\n{{ price |> round(2) |> format }}\n{{ text |> escape |> truncate(100) }}",
                insertText: "{% ${1:value} |> ${2:filter} %}",
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "150",
            },
            {
                label: "range",
                kind: CompletionItemKind.Snippet,
                documentation:
                    "范围循环\n\n遍历一个数字范围。\n使用 .. 操作符定义范围（包含两端）。\n\n示例:\n{% loop i in 1..10 %}\n  <span>{{ i }}</span>\n{% end loop %}\n\n遍历 1 到 10 的所有整数。",
                insertText:
                    "{% loop ${1:i} in ${2:1}..${3:10} %}\n\t$0\n{% end loop %}",
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "151",
            },
        ];
    }

    /**
     * 获取定界符补全
     */
    private getDelimiterCompletions(): CompletionItem[] {
        return [
            {
                label: "code-block",
                kind: CompletionItemKind.Snippet,
                documentation: "代码块定界符",
                insertText: "{% $0 %}",
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "200",
            },
            {
                label: "comment-block",
                kind: CompletionItemKind.Snippet,
                documentation: "注释块定界符",
                insertText: "{# $0 #}",
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: "201",
            },
        ];
    }

    /**
     * 获取上下文感知补全
     */
    private getContextCompletions(
        cachedDoc: CachedDocument,
        position: Position,
    ): CompletionItem[] {
        const completions: CompletionItem[] = [];
        const symbols = cachedDoc.parseResult.symbols;
        const _scopes = cachedDoc.parseResult.scopes;

        for (const [_key, symbol] of symbols) {
            if (this.isPositionInScope(position, symbol.scopeRange)) {
                completions.push({
                    label: symbol.name,
                    kind: this.getCompletionItemKind(symbol.type),
                    documentation: this.getSymbolDocumentation(symbol),
                    sortText: `3${symbol.name}`,
                });
            }
        }

        return completions;
    }

    /**
     * 检查位置是否在作用域内
     */
    private isPositionInScope(position: Position, scopeRange: Range): boolean {
        const posLine = position.line;
        const posChar = position.character;
        const startLine = scopeRange.start.line;
        const endLine = scopeRange.end.line;

        if (posLine < startLine || posLine > endLine) {
            return false;
        }

        if (posLine === startLine && posChar < scopeRange.start.character) {
            return false;
        }

        if (posLine === endLine && posChar > scopeRange.end.character) {
            return false;
        }

        return true;
    }

    /**
     * 获取补全项类型
     */
    private getCompletionItemKind(type: SymbolType): CompletionItemKind {
        switch (type) {
            case SymbolType.Variable:
                return CompletionItemKind.Variable;
            case SymbolType.Function:
                return CompletionItemKind.Function;
            case SymbolType.Parameter:
                return CompletionItemKind.TypeParameter;
            case SymbolType.LoopVariable:
                return CompletionItemKind.Variable;
            case SymbolType.Block:
                return CompletionItemKind.Class;
            case SymbolType.Template:
                return CompletionItemKind.File;
            default:
                return CompletionItemKind.Variable;
        }
    }

    private getSymbolDocumentation(symbol: SymbolInfo): string {
        const typeNames: Record<SymbolType, string> = {
            [SymbolType.Variable]: "变量",
            [SymbolType.Function]: "函数",
            [SymbolType.Parameter]: "参数",
            [SymbolType.LoopVariable]: "循环变量",
            [SymbolType.Block]: "块",
            [SymbolType.Template]: "模板",
        };
        return `${typeNames[symbol.type]}: ${symbol.name}`;
    }
}

/**
 * 悬停提供器
 */
class HoverProvider {
    /**
     * 模板继承分析器实例
     */
    private inheritanceAnalyzer: TemplateInheritanceAnalyzer | null = null;

    /**
     * 设置模板继承分析器
     * @param analyzer 模板继承分析器实例
     */
    public setInheritanceAnalyzer(analyzer: TemplateInheritanceAnalyzer): void {
        this.inheritanceAnalyzer = analyzer;
    }

    /**
     * 获取悬停信息
     */
    public getHover(
        document: TextDocument,
        position: Position,
        cachedDoc: CachedDocument | undefined,
    ): Hover | null {
        if (!cachedDoc) {
            return null;
        }

        const content = document.getText();
        const offset = document.offsetAt(position);
        const word = this.getWordAtPosition(content, offset);

        if (!word) {
            return null;
        }

        const blockHover = this.getBlockHover(document, position, cachedDoc);
        if (blockHover) {
            return blockHover;
        }

        const symbol = this.findSymbolAtPosition(
            word,
            position,
            cachedDoc.parseResult,
        );
        if (symbol) {
            return this.createSymbolHover(
                symbol,
                cachedDoc.parseResult.errors,
                position,
            );
        }

        const builtinDoc = this.getBuiltinFunctionDoc(word);
        if (builtinDoc) {
            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: builtinDoc,
                },
            };
        }

        const keywordDoc = this.getKeywordDoc(word);
        if (keywordDoc) {
            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: keywordDoc,
                },
            };
        }

        const errorHover = this.getErrorHoverAtPosition(
            position,
            cachedDoc.parseResult,
        );
        if (errorHover) {
            return errorHover;
        }

        return null;
    }

    /**
     * 获取 block 语句的悬停信息（显示覆盖关系）
     */
    private getBlockHover(
        document: TextDocument,
        position: Position,
        cachedDoc: CachedDocument,
    ): Hover | null {
        if (!this.inheritanceAnalyzer || !cachedDoc.parseResult.ir) {
            return null;
        }

        const blockInfo = this.findBlockAtPosition(
            cachedDoc,
            position,
            document,
        );
        if (!blockInfo) {
            return null;
        }

        const chain = this.inheritanceAnalyzer.getBlockChain(
            blockInfo.name,
            document.uri,
            document,
            cachedDoc,
        );

        if (chain.length === 0) {
            return null;
        }

        const markdown = this.inheritanceAnalyzer.formatBlockOverrideChain(
            blockInfo.name,
            chain,
        );

        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: markdown,
            },
        };
    }

    /**
     * Find block at position from IR facts (not Program AST walk).
     */
    private findBlockAtPosition(
        cachedDoc: CachedDocument,
        position: Position,
        document: TextDocument,
    ): BlockInfo | null {
        const ir = cachedDoc.parseResult.ir;
        if (!ir) return null;
        const offset = document.offsetAt(position);
        const facts = extractTemplateFacts(ir);
        for (const b of facts.blocks) {
            if (offset >= b.start && offset <= b.end) {
                const start = document.positionAt(
                    Math.max(0, Math.min(b.start, document.getText().length)),
                );
                const endPos = document.positionAt(
                    Math.max(0, Math.min(b.end, document.getText().length)),
                );
                return {
                    name: b.name,
                    range: Range.create(start, endPos),
                    type: BlockType.Block,
                    templatePath: document.uri,
                    line: start.line + 1,
                };
            }
        }
        return null;
    }

    /**
     * 查找位置处的符号
     */
    private findSymbolAtPosition(
        name: string,
        position: Position,
        parseResult: ParseResult,
    ): SymbolInfo | null {
        for (const [_key, symbol] of parseResult.symbols) {
            if (
                symbol.name === name &&
                this.isPositionInScope(position, symbol.scopeRange)
            ) {
                return symbol;
            }
        }
        return null;
    }

    /**
     * 检查位置是否在作用域内
     */
    private isPositionInScope(position: Position, scopeRange: Range): boolean {
        const posLine = position.line;
        const startLine = scopeRange.start.line;
        const endLine = scopeRange.end.line;

        return posLine >= startLine && posLine <= endLine;
    }

    /**
     * 创建符号悬停信息
     */
    private createSymbolHover(
        symbol: SymbolInfo,
        errors: ParseError[],
        position: Position,
    ): Hover {
        const typeNames: Record<SymbolType, string> = {
            [SymbolType.Variable]: "变量",
            [SymbolType.Function]: "函数",
            [SymbolType.Parameter]: "参数",
            [SymbolType.LoopVariable]: "循环变量",
            [SymbolType.Block]: "块",
            [SymbolType.Template]: "模板",
        };

        const defLine = symbol.definitionRange.start.line + 1;
        const defChar = symbol.definitionRange.start.character + 1;

        let markdown = `**${symbol.name}** (${typeNames[symbol.type]})\n\n`;

        if (symbol.inferredType) {
            const typeInferer = new TypeInferer();
            const typeStr = typeInferer.formatTypeInfo(symbol.inferredType);
            markdown += `**类型**: \`${typeStr}\`\n\n`;
        }

        markdown += `**定义位置**: 行 ${defLine}, 列 ${defChar}\n\n`;

        const relatedError = this.findRelatedError(
            symbol.name,
            position,
            errors,
        );
        if (relatedError) {
            const errorCode = relatedError.code || ErrorCode.SyntaxError;
            const errorConfig = ERROR_CONFIGS[errorCode];
            markdown += `---\n\n`;
            markdown += `**错误代码**: [${errorCode}]\n\n`;
            markdown += `**错误信息**: ${relatedError.message}\n\n`;
            if (errorConfig.fixSuggestion) {
                markdown += `**修复建议**: ${errorConfig.fixSuggestion}\n\n`;
            }
            markdown += `[查看文档](${errorConfig.documentationUrl})\n\n`;
        }

        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: markdown,
            },
        };
    }

    /**
     * 查找相关错误
     */
    private findRelatedError(
        _name: string,
        position: Position,
        errors: ParseError[],
    ): ParseError | null {
        for (const error of errors) {
            if (this.isPositionInRange(position, error.range)) {
                return error;
            }
        }
        return null;
    }

    /**
     * 检查位置是否在范围内
     */
    private isPositionInRange(position: Position, range: Range): boolean {
        if (
            position.line < range.start.line ||
            position.line > range.end.line
        ) {
            return false;
        }
        if (
            position.line === range.start.line &&
            position.character < range.start.character
        ) {
            return false;
        }
        if (
            position.line === range.end.line &&
            position.character > range.end.character
        ) {
            return false;
        }
        return true;
    }

    /**
     * 获取错误位置的悬停信息
     */
    private getErrorHoverAtPosition(
        position: Position,
        parseResult: ParseResult,
    ): Hover | null {
        for (const error of parseResult.errors) {
            if (this.isPositionInRange(position, error.range)) {
                const errorCode = error.code || ErrorCode.SyntaxError;
                const errorConfig = ERROR_CONFIGS[errorCode];

                let markdown = `**错误** [${errorCode}]\n\n`;
                markdown += `${error.message}\n\n`;

                if (errorConfig) {
                    if (errorConfig.fixSuggestion) {
                        markdown += `**修复建议**: ${errorConfig.fixSuggestion}\n\n`;
                    }
                    markdown += `[查看文档](${errorConfig.documentationUrl})\n\n`;
                }

                return {
                    contents: {
                        kind: MarkupKind.Markdown,
                        value: markdown,
                    },
                };
            }
        }
        return null;
    }

    /**
     * 获取内置函数文档
     */
    private getBuiltinFunctionDoc(name: string): string | null {
        const funcDoc = BUILTIN_FUNCTIONS.get(name);
        if (!funcDoc) {
            return null;
        }

        let markdown = `**${funcDoc.name}** (内置函数)\n\n`;
        markdown += `\`\`\`\n${funcDoc.signature}\n\`\`\`\n\n`;
        markdown += `${funcDoc.description}\n\n`;

        if (funcDoc.parameters.length > 0) {
            markdown += "**参数:**\n\n";
            for (const param of funcDoc.parameters) {
                markdown += `- \`${param.name}\` (${param.type}): ${param.description}\n`;
            }
            markdown += "\n";
        }

        markdown += `**返回值:** \`${funcDoc.returnType}\`\n\n`;

        if (funcDoc.examples.length > 0) {
            markdown += "**示例:**\n\n";
            markdown += "```dejavu\n";
            for (const example of funcDoc.examples) {
                markdown += `${example}\n`;
            }
            markdown += "```\n";
        }

        return markdown;
    }

    /**
     * 获取关键字文档
     */
    private getKeywordDoc(word: string): string | null {
        const keywordDocs: Record<string, string> = {
            let: "**let** - 变量声明\n\n用于声明一个变量并可选地初始化它。\n\n```dejavu\nlet name = value\n```\n\n```doki\n{% let name = value %}\n```",
            if: "**if** - 条件语句\n\n用于根据条件执行不同的代码块。\n\n```dejavu\nif condition\n  // code\nelse if other\n  // code\nelse\n  // code\nend if\n```\n\n```doki\n{% if condition %}\n  // code\n{% else if other %}\n  // code\n{% else %}\n  // code\n{% end if %}\n```",
            else: "**else** - 否则分支\n\n与 if 语句配合使用，当条件为假时执行。",
            "else if":
                "**else if** - 否则如果分支\n\n与 if 语句配合使用，添加额外的条件判断。",
            loop: "**loop** - 循环语句\n\n用于创建循环，支持范围循环、集合遍历和条件循环。\n\n**范围循环:**\n```dejavu\nloop i in 0..10\n  // code\nend loop\n```\n\n**集合遍历:**\n```dejavu\nloop item in list\n  // code\nend loop\n```\n\n**带索引遍历:**\n```dejavu\nloop (index, item) in list\n  // code\nend loop\n```",
            break: "**break** - 跳出循环\n\n用于立即退出当前循环。",
            continue:
                "**continue** - 继续下一次循环\n\n用于跳过当前迭代，继续下一次循环。",
            micro: "**micro** - 微函数声明\n\n用于声明一个微函数。\n\n```dejavu\nmicro name(params)\n  // code\nend micro\n```\n\n```doki\n{% micro name(params) %}\n  // code\n{% end micro %}\n```",
            namespace: "**namespace** - 命名空间\n\n用于声明一个命名空间。",
            using: "**using** - 导入模块\n\n用于导入外部模块。",
            match: "**match** - 模式匹配\n\n用于进行模式匹配。\n\n```dejavu\nmatch value\n  case pattern1 => result1\n  case pattern2 => result2\n  case _ => default\nend match\n```\n\n```doki\n{% match value %}\n  {% case pattern1 %} result1 {% end case %}\n  {% case pattern2 %} result2 {% end case %}\n  {% case _ %} default {% end case %}\n{% end match %}\n```",
            case: "**case** - 匹配分支\n\n用于定义模式匹配的一个分支。`_` 表示通配符，匹配所有情况。",
            end: "**end** - 结束语句块\n\n用于显式结束一个语句块。通常与 `if`、`loop`、`match`、`micro` 配合使用。",
            "end if":
                "**end if** - 结束 if 语句\n\n显式结束一个 if 条件语句块。",
            "end loop":
                "**end loop** - 结束 loop 语句\n\n显式结束一个 loop 循环语句块。",
            "end match":
                "**end match** - 结束 match 语句\n\n显式结束一个 match 匹配语句块。",
            "end micro":
                "**end micro** - 结束 micro 函数\n\n显式结束一个 micro 函数定义。",
            true: "**true** - 布尔值\n\n表示布尔值真。",
            false: "**false** - 布尔值\n\n表示布尔值假。",
            extends:
                '**extends** - 模板继承\n\n用于声明当前模板继承自另一个模板。\n\n```dejavu\nextends "base.html"\n```\n\n```doki\n{% extends "base.html" %}\n```',
            block: "**block** - 块声明\n\n用于定义可被子模板覆盖的块。\n\n```dejavu\nblock content\n  // 默认内容\nend block\n```\n\n```doki\n{% block content %}\n  // 默认内容\n{% end block %}\n```",
            prepend:
                "**prepend** - 前置追加\n\n用于在父块内容前追加内容。\n\n```dejavu\nprepend content\n  // 追加内容\nend prepend\n```\n\n```doki\n{% prepend content %}\n  // 追加内容\n{% end prepend %}\n```",
            append: "**append** - 后置追加\n\n用于在父块内容后追加内容。\n\n```dejavu\nappend content\n  // 追加内容\nend append\n```\n\n```doki\n{% append content %}\n  // 追加内容\n{% end append %}\n```",
            super: "**super** - 调用父块\n\n用于在子模板中调用父块的默认内容。\n\n```dejavu\nsuper\n```\n\n```doki\n{% super %}\n```",
            "end block":
                "**end block** - 结束块声明\n\n显式结束一个 block 块声明。",
            "end prepend":
                "**end prepend** - 结束前置追加\n\n显式结束一个 prepend 块。",
            "end append":
                "**end append** - 结束后置追加\n\n显式结束一个 append 块。",
        };

        return keywordDocs[word] || null;
    }

    /**
     * 获取当前位置的单词
     */
    private getWordAtPosition(content: string, offset: number): string | null {
        let start = offset;
        let end = offset;

        while (start > 0 && /[a-zA-Z0-9_]/.test(content[start - 1])) {
            start--;
        }

        while (end < content.length && /[a-zA-Z0-9_]/.test(content[end])) {
            end++;
        }

        if (start === end) {
            return null;
        }

        return content.substring(start, end);
    }
}

/**
 * 文档符号提供器
 */
class DocumentSymbolProvider {
    /**
     * 获取文档符号
     */
    public getSymbols(
        _document: TextDocument,
        cachedDoc: CachedDocument | undefined,
    ): DocumentSymbol[] {
        if (!cachedDoc || !cachedDoc.parseResult.ir) {
            return [];
        }

        const symbols: DocumentSymbol[] = [];
        const parseResult = cachedDoc.parseResult;

        for (const [_key, symbol] of parseResult.symbols) {
            if (
                symbol.type === SymbolType.Variable ||
                symbol.type === SymbolType.Function ||
                symbol.type === SymbolType.Block
            ) {
                const docSymbol = DocumentSymbol.create(
                    symbol.name,
                    this.getSymbolDetail(symbol),
                    this.getSymbolKind(symbol.type),
                    symbol.scopeRange,
                    symbol.definitionRange,
                );
                symbols.push(docSymbol);
            }
        }

        return symbols;
    }

    /**
     * 获取符号详情
     */
    private getSymbolDetail(symbol: SymbolInfo): string {
        const typeNames: Record<SymbolType, string> = {
            [SymbolType.Variable]: "变量声明",
            [SymbolType.Function]: "函数声明",
            [SymbolType.Parameter]: "参数",
            [SymbolType.LoopVariable]: "循环变量",
            [SymbolType.Block]: "块声明",
            [SymbolType.Template]: "模板引用",
        };
        return typeNames[symbol.type];
    }

    private getSymbolKind(type: SymbolType): SymbolKind {
        switch (type) {
            case SymbolType.Variable:
                return SymbolKind.Variable;
            case SymbolType.Function:
                return SymbolKind.Function;
            case SymbolType.Parameter:
                return SymbolKind.TypeParameter;
            case SymbolType.LoopVariable:
                return SymbolKind.Variable;
            case SymbolType.Block:
                return SymbolKind.Class;
            case SymbolType.Template:
                return SymbolKind.File;
            default:
                return SymbolKind.Variable;
        }
    }
}

/**
 * 定义跳转提供器
 */
class DefinitionProvider {
    /**
     * 获取定义位置
     */
    public getDefinition(
        document: TextDocument,
        position: Position,
        cachedDoc: CachedDocument | undefined,
    ): Definition | null {
        if (!cachedDoc) {
            return null;
        }

        const extendsDefinition = this.getExtendsDefinition(
            document,
            position,
            cachedDoc,
        );
        if (extendsDefinition) {
            return extendsDefinition;
        }

        const content = document.getText();
        const offset = document.offsetAt(position);
        const word = this.getWordAtPosition(content, offset);

        if (!word) {
            return null;
        }

        const symbol = this.findSymbolDefinition(
            word,
            position,
            cachedDoc.parseResult,
        );
        if (symbol) {
            return {
                uri: document.uri,
                range: symbol.definitionRange,
            };
        }

        return null;
    }

    /**
     * 获取 extends 语句的定义位置（父模板文件）
     */
    private getExtendsDefinition(
        document: TextDocument,
        position: Position,
        cachedDoc: CachedDocument,
    ): Definition | null {
        if (!cachedDoc.parseResult.ir) {
            return null;
        }

        const extendsInfo = this.findExtendsAtPosition(
            cachedDoc,
            position,
            document,
        );
        if (!extendsInfo) {
            return null;
        }

        const parentTemplatePath = extendsInfo.templatePath;
        if (!parentTemplatePath) {
            return null;
        }

        const resolvedUri = this.resolveTemplateUri(
            document.uri,
            parentTemplatePath,
        );
        if (!resolvedUri) {
            return null;
        }

        return {
            uri: resolvedUri,
            range: Range.create(Position.create(0, 0), Position.create(0, 0)),
        };
    }

    /**
     * Extends path from IR Stmt.Extends — not Program AST walk.
     */
    private findExtendsAtPosition(
        cachedDoc: CachedDocument,
        position: Position,
        document: TextDocument,
    ): { templatePath: string; range: Range } | null {
        const ir = cachedDoc.parseResult.ir;
        if (!ir) return null;
        const facts = extractTemplateFacts(ir);
        if (!facts.extendsPath) return null;

        // Entire document may contain extends; accept when cursor is in any Stmt.Extends span.
        const offset = document.offsetAt(position);
        let hit = false;
        let spanStart = 0;
        let spanEnd = 0;
        walkIr(ir.body, (n) => {
            if (n.type !== "Stmt.Extends") return;
            const span = n.span;
            if (!span) return;
            if (offset >= span.start && offset <= span.end) {
                hit = true;
                spanStart = span.start;
                spanEnd = span.end;
            }
        });
        if (!hit) return null;
        const startPos = document.positionAt(
            Math.max(0, Math.min(spanStart, document.getText().length)),
        );
        const endPos = document.positionAt(
            Math.max(0, Math.min(spanEnd, document.getText().length)),
        );
        return {
            templatePath: facts.extendsPath,
            range: Range.create(startPos, endPos),
        };
    }

    /**
     * 解析模板 URI
     */
    private resolveTemplateUri(
        currentUri: string,
        templatePath: string,
    ): string | undefined {
        if (templatePath.startsWith("file://")) {
            return templatePath;
        }

        const currentPath = this.uriToPath(currentUri);
        if (!currentPath) {
            return undefined;
        }

        const pathParts = currentPath.split(/[/\\]/);
        pathParts.pop();

        const templateParts = templatePath.split(/[/\\]/);
        for (const part of templateParts) {
            if (part === "..") {
                pathParts.pop();
            } else if (part !== ".") {
                pathParts.push(part);
            }
        }

        const resolvedPath = pathParts.join("/");
        return `file:///${resolvedPath}`;
    }

    /**
     * 将 URI 转换为路径
     */
    private uriToPath(uri: string): string | undefined {
        if (uri.startsWith("file:///")) {
            return uri.substring(8);
        }
        if (uri.startsWith("file://")) {
            return uri.substring(7);
        }
        return undefined;
    }

    /**
     * 查找符号定义
     */
    private findSymbolDefinition(
        name: string,
        position: Position,
        parseResult: ParseResult,
    ): SymbolInfo | null {
        for (const [_key, symbol] of parseResult.symbols) {
            if (
                symbol.name === name &&
                this.isPositionInScope(position, symbol.scopeRange)
            ) {
                return symbol;
            }
        }
        return null;
    }

    /**
     * 检查位置是否在作用域内
     */
    private isPositionInScope(position: Position, scopeRange: Range): boolean {
        const posLine = position.line;
        const startLine = scopeRange.start.line;
        const endLine = scopeRange.end.line;
        return posLine >= startLine && posLine <= endLine;
    }

    /**
     * 获取当前位置的单词
     */
    private getWordAtPosition(content: string, offset: number): string | null {
        let start = offset;
        let end = offset;

        while (start > 0 && /[a-zA-Z0-9_]/.test(content[start - 1])) {
            start--;
        }

        while (end < content.length && /[a-zA-Z0-9_]/.test(content[end])) {
            end++;
        }

        if (start === end) {
            return null;
        }

        return content.substring(start, end);
    }
}

/**
 * 引用查找提供器
 */
class ReferencesProvider {
    /**
     * 获取引用位置
     */
    public getReferences(
        document: TextDocument,
        position: Position,
        cachedDoc: CachedDocument | undefined,
    ): Location[] {
        if (!cachedDoc) {
            return [];
        }

        const content = document.getText();
        const offset = document.offsetAt(position);
        const word = this.getWordAtPosition(content, offset);

        if (!word) {
            return [];
        }

        const locations: Location[] = [];
        const symbol = this.findSymbol(word, position, cachedDoc.parseResult);

        if (symbol) {
            locations.push({
                uri: document.uri,
                range: symbol.definitionRange,
            });

            for (const ref of symbol.references) {
                locations.push({
                    uri: document.uri,
                    range: ref,
                });
            }
        }

        return locations;
    }

    /**
     * 查找符号
     */
    private findSymbol(
        name: string,
        position: Position,
        parseResult: ParseResult,
    ): SymbolInfo | null {
        for (const [_key, symbol] of parseResult.symbols) {
            if (
                symbol.name === name &&
                this.isPositionInScope(position, symbol.scopeRange)
            ) {
                return symbol;
            }
        }
        return null;
    }

    /**
     * 检查位置是否在作用域内
     */
    private isPositionInScope(position: Position, scopeRange: Range): boolean {
        const posLine = position.line;
        const startLine = scopeRange.start.line;
        const endLine = scopeRange.end.line;
        return posLine >= startLine && posLine <= endLine;
    }

    /**
     * 获取当前位置的单词
     */
    private getWordAtPosition(content: string, offset: number): string | null {
        let start = offset;
        let end = offset;

        while (start > 0 && /[a-zA-Z0-9_]/.test(content[start - 1])) {
            start--;
        }

        while (end < content.length && /[a-zA-Z0-9_]/.test(content[end])) {
            end++;
        }

        if (start === end) {
            return null;
        }

        return content.substring(start, end);
    }
}

/**
 * 文档高亮提供器
 */
class DocumentHighlightProvider {
    /**
     * 获取文档高亮
     */
    public getHighlights(
        document: TextDocument,
        position: Position,
        cachedDoc: CachedDocument | undefined,
    ): DocumentHighlight[] {
        if (!cachedDoc) {
            return [];
        }

        const content = document.getText();
        const offset = document.offsetAt(position);
        const word = this.getWordAtPosition(content, offset);

        if (!word) {
            return [];
        }

        const highlights: DocumentHighlight[] = [];
        const symbol = this.findSymbol(word, position, cachedDoc.parseResult);

        if (symbol) {
            highlights.push({
                range: symbol.definitionRange,
                kind: DocumentHighlightKind.Write,
            });

            for (const ref of symbol.references) {
                highlights.push({
                    range: ref,
                    kind: DocumentHighlightKind.Read,
                });
            }
        }

        return highlights;
    }

    /**
     * 查找符号
     */
    private findSymbol(
        name: string,
        position: Position,
        parseResult: ParseResult,
    ): SymbolInfo | null {
        for (const [_key, symbol] of parseResult.symbols) {
            if (
                symbol.name === name &&
                this.isPositionInScope(position, symbol.scopeRange)
            ) {
                return symbol;
            }
        }
        return null;
    }

    /**
     * 检查位置是否在作用域内
     */
    private isPositionInScope(position: Position, scopeRange: Range): boolean {
        const posLine = position.line;
        const startLine = scopeRange.start.line;
        const endLine = scopeRange.end.line;
        return posLine >= startLine && posLine <= endLine;
    }

    /**
     * 获取当前位置的单词
     */
    private getWordAtPosition(content: string, offset: number): string | null {
        let start = offset;
        let end = offset;

        while (start > 0 && /[a-zA-Z0-9_]/.test(content[start - 1])) {
            start--;
        }

        while (end < content.length && /[a-zA-Z0-9_]/.test(content[end])) {
            end++;
        }

        if (start === end) {
            return null;
        }

        return content.substring(start, end);
    }
}

/**
 * 重命名提供器
 */
class RenameProvider {
    /**
     * 获取重命名编辑
     */
    public getRenameEdits(
        document: TextDocument,
        position: Position,
        newName: string,
        cachedDoc: CachedDocument | undefined,
    ): WorkspaceEdit | null {
        if (!cachedDoc) {
            return null;
        }

        const content = document.getText();
        const offset = document.offsetAt(position);
        const word = this.getWordAtPosition(content, offset);

        if (!word) {
            return null;
        }

        const symbol = this.findSymbol(word, position, cachedDoc.parseResult);
        if (!symbol) {
            return null;
        }

        const edits: TextEdit[] = [];

        edits.push({
            range: symbol.definitionRange,
            newText: newName,
        });

        for (const ref of symbol.references) {
            edits.push({
                range: ref,
                newText: newName,
            });
        }

        return {
            changes: {
                [document.uri]: edits,
            },
        };
    }

    /**
     * 查找符号
     */
    private findSymbol(
        name: string,
        position: Position,
        parseResult: ParseResult,
    ): SymbolInfo | null {
        for (const [_key, symbol] of parseResult.symbols) {
            if (
                symbol.name === name &&
                this.isPositionInScope(position, symbol.scopeRange)
            ) {
                return symbol;
            }
        }
        return null;
    }

    /**
     * 检查位置是否在作用域内
     */
    private isPositionInScope(position: Position, scopeRange: Range): boolean {
        const posLine = position.line;
        const startLine = scopeRange.start.line;
        const endLine = scopeRange.end.line;
        return posLine >= startLine && posLine <= endLine;
    }

    /**
     * 获取当前位置的单词
     */
    private getWordAtPosition(content: string, offset: number): string | null {
        let start = offset;
        let end = offset;

        while (start > 0 && /[a-zA-Z0-9_]/.test(content[start - 1])) {
            start--;
        }

        while (end < content.length && /[a-zA-Z0-9_]/.test(content[end])) {
            end++;
        }

        if (start === end) {
            return null;
        }

        return content.substring(start, end);
    }
}

class SemanticTokensProvider {
    private legend: SemanticTokensLegend;

    constructor() {
        this.legend = {
            tokenTypes: [
                SemanticTokenTypes.variable,
                SemanticTokenTypes.function,
                SemanticTokenTypes.parameter,
                SemanticTokenTypes.keyword,
                SemanticTokenTypes.string,
                SemanticTokenTypes.number,
                SemanticTokenTypes.comment,
                SemanticTokenTypes.operator,
            ],
            tokenModifiers: [
                SemanticTokenModifiers.declaration,
                SemanticTokenModifiers.definition,
                SemanticTokenModifiers.readonly,
                SemanticTokenModifiers.static,
            ],
        };
    }

    public getLegend(): SemanticTokensLegend {
        return this.legend;
    }

    public getSemanticTokens(
        document: TextDocument,
        cachedDoc: CachedDocument | undefined,
    ): number[] {
        const builder = new SemanticTokensBuilder();

        if (!cachedDoc || !cachedDoc.parseResult.ir) {
            return builder.build().data;
        }

        this.collectTokensFromIr(
            cachedDoc.parseResult.ir,
            document,
            builder,
            cachedDoc.parseResult,
        );

        return builder.build().data;
    }

    /** Semantic tokens from IR spans + symbol table — not NodeType DFS. */
    private collectTokensFromIr(
        ir: IrDocument,
        document: TextDocument,
        builder: SemanticTokensBuilder,
        parseResult: ParseResult,
    ): void {
        const len = document.getText().length;
        walkIr(ir.body, (n) => {
            const span = n.span;
            if (!span) return;
            const start = document.positionAt(
                Math.max(0, Math.min(span.start, len)),
            );
            const end = document.positionAt(
                Math.max(0, Math.min(span.end, len)),
            );
            const loc = {
                start: { line: start.line + 1, column: start.character },
                end: { line: end.line + 1, column: end.character },
            };

            if (n.type === "Stmt.Block") {
                this.pushToken(
                    builder,
                    document,
                    loc,
                    SemanticTokenTypes.namespace,
                    [SemanticTokenModifiers.declaration],
                );
            } else if (n.type === "Stmt.For") {
                this.pushToken(
                    builder,
                    document,
                    loc,
                    SemanticTokenTypes.variable,
                    [SemanticTokenModifiers.declaration],
                );
            } else if (n.type === "Expr.Identifier") {
                const name = n.name;
                const symbolKey = this.findSymbolKey(name, parseResult);
                if (symbolKey) {
                    const symbol = parseResult.symbols.get(symbolKey);
                    if (symbol) {
                        const tokenType = this.getSemanticTokenType(
                            symbol.type,
                        );
                        const modifiers = this.isDefinition(
                            loc,
                            symbol.definitionRange,
                        )
                            ? [SemanticTokenModifiers.definition]
                            : [];
                        this.pushToken(
                            builder,
                            document,
                            loc,
                            tokenType,
                            modifiers,
                        );
                    }
                } else {
                    this.pushToken(
                        builder,
                        document,
                        loc,
                        SemanticTokenTypes.variable,
                        [],
                    );
                }
            } else if (n.type === "Expr.Literal") {
                const tokenType =
                    typeof n.value === "number"
                        ? SemanticTokenTypes.number
                        : SemanticTokenTypes.string;
                this.pushToken(builder, document, loc, tokenType, []);
            } else if (n.type === "Stmt.Extends" || n.type === "Stmt.Include") {
                this.pushToken(
                    builder,
                    document,
                    loc,
                    SemanticTokenTypes.keyword,
                    [],
                );
            } else if (n.type === "Stmt.If" || n.type === "Stmt.ElseIf") {
                this.pushToken(
                    builder,
                    document,
                    loc,
                    SemanticTokenTypes.keyword,
                    [],
                );
            } else if (n.type === "Expr.Pipe") {
                this.pushToken(
                    builder,
                    document,
                    loc,
                    SemanticTokenTypes.function,
                    [],
                );
            }
        });
    }

    private pushToken(
        builder: SemanticTokensBuilder,
        document: TextDocument,
        loc: {
            start: { line: number; column: number };
            end: { line: number; column: number };
        },
        tokenType: string,
        modifiers: string[],
    ): void {
        const startPos = Position.create(loc.start.line - 1, loc.start.column);
        const endPos = Position.create(loc.end.line - 1, loc.end.column);
        const startOffset = document.offsetAt(startPos);
        const endOffset = document.offsetAt(endPos);
        const length = endOffset - startOffset;

        builder.push(
            loc.start.line - 1,
            loc.start.column,
            length,
            this.legend.tokenTypes.indexOf(tokenType as any),
            modifiers.reduce((acc, mod, _idx) => {
                const modIndex = this.legend.tokenModifiers.indexOf(mod as any);
                if (modIndex >= 0) {
                    return acc | (1 << modIndex);
                }
                return acc;
            }, 0),
        );
    }

    private findSymbolKey(
        name: string,
        parseResult: ParseResult,
    ): string | null {
        for (const [key, symbol] of parseResult.symbols) {
            if (symbol.name === name) {
                return key;
            }
        }
        return null;
    }

    private isDefinition(
        loc: {
            start: { line: number; column: number };
            end: { line: number; column: number };
        },
        defRange: Range,
    ): boolean {
        return (
            loc.start.line - 1 === defRange.start.line &&
            loc.start.column === defRange.start.character
        );
    }

    private getSemanticTokenType(type: SymbolType): string {
        switch (type) {
            case SymbolType.Variable:
                return SemanticTokenTypes.variable;
            case SymbolType.Function:
                return SemanticTokenTypes.function;
            case SymbolType.Parameter:
                return SemanticTokenTypes.parameter;
            case SymbolType.LoopVariable:
                return SemanticTokenTypes.variable;
            case SymbolType.Block:
                return SemanticTokenTypes.function;
            case SymbolType.Template:
                return SemanticTokenTypes.string;
            default:
                return SemanticTokenTypes.variable;
        }
    }
}

class FormattingProvider {
    private languageManager: LanguageConfigManager;
    private configManager: ConfigManager;

    constructor() {
        this.languageManager = LanguageConfigManager.getInstance();
        this.configManager = ConfigManager.getInstance();
    }

    public formatDocument(
        document: TextDocument,
        _params: DocumentFormattingParams,
    ): TextEdit[] {
        const content = document.getText();
        const languageConfig = this.languageManager.getLanguageFromUri(
            document.uri,
        );
        const formatConfig = this.configManager.getFormatConfig();
        return this.formatContent(
            content,
            languageConfig,
            formatConfig,
            document,
        );
    }

    public formatRange(
        document: TextDocument,
        params: DocumentRangeFormattingParams,
    ): TextEdit[] {
        const _content = document.getText();
        const range = params.range;
        const rangeContent = document.getText(range);
        const languageConfig = this.languageManager.getLanguageFromUri(
            document.uri,
        );
        const formatConfig = this.configManager.getFormatConfig();

        const formattedRange = this.formatCodeBlocks(
            rangeContent,
            languageConfig,
            formatConfig,
        );

        return [TextEdit.replace(range, formattedRange)];
    }

    private formatContent(
        content: string,
        languageConfig: LanguageConfig,
        formatConfig: FormatConfig,
        document: TextDocument,
    ): TextEdit[] {
        const formatted = this.formatCodeBlocks(
            content,
            languageConfig,
            formatConfig,
        );

        if (formatted === content) {
            return [];
        }

        return [
            TextEdit.replace(
                Range.create(
                    Position.create(0, 0),
                    Position.create(document.lineCount, 0),
                ),
                formatted,
            ),
        ];
    }

    private formatCodeBlocks(
        content: string,
        languageConfig: LanguageConfig,
        formatConfig: FormatConfig,
    ): string {
        let result = content;

        result = this.normalizeWhitespace(result, languageConfig);
        result = this.formatControlStructures(
            result,
            languageConfig,
            formatConfig,
        );
        result = this.formatSpacing(result, languageConfig);

        if (formatConfig.preserveNewlines) {
            result = this.preserveNewlines(result);
        }

        return result;
    }

    private normalizeWhitespace(
        content: string,
        languageConfig: LanguageConfig,
    ): string {
        const codeStart = languageConfig.codeStart;
        const codeEnd = languageConfig.codeEnd;

        let result = content;

        result = result.replace(
            new RegExp(`${this.escapeRegex(codeStart)}\\s+`, "g"),
            `${codeStart} `,
        );
        result = result.replace(
            new RegExp(`\\s+${this.escapeRegex(codeEnd)}`, "g"),
            ` ${codeEnd}`,
        );

        return result;
    }

    private formatControlStructures(
        content: string,
        languageConfig: LanguageConfig,
        formatConfig: FormatConfig,
    ): string {
        const codeStart = languageConfig.codeStart;
        const codeEnd = languageConfig.codeEnd;
        const indentSize = formatConfig.indentSize;

        let result = content;

        const patterns = [
            { pattern: "if", end: "end if" },
            { pattern: "loop", end: "end loop" },
            { pattern: "match", end: "end match" },
            { pattern: "micro", end: "end micro" },
        ];

        for (const { pattern, end } of patterns) {
            const startPattern = new RegExp(
                `${this.escapeRegex(codeStart)}\\s*${pattern}\\b`,
                "g",
            );
            result = result.replace(startPattern, `${codeStart} ${pattern}`);

            const endPattern = new RegExp(
                this.escapeRegex(codeStart) +
                    "\\s*" +
                    this.escapeRegex(end) +
                    "\\s*" +
                    this.escapeRegex(codeEnd),
                "g",
            );
            result = result.replace(
                endPattern,
                `${codeStart} ${end} ${codeEnd}`,
            );
        }

        result = this.applyIndentation(result, codeStart, codeEnd, indentSize);

        return result;
    }

    private applyIndentation(
        content: string,
        codeStart: string,
        _codeEnd: string,
        indentSize: number,
    ): string {
        const lines = content.split("\n");
        const result: string[] = [];
        let indentLevel = 0;
        const indentStr = " ".repeat(indentSize);

        const increaseIndentPatterns = [
            new RegExp(`${this.escapeRegex(codeStart)}\\s*if\\b`),
            new RegExp(`${this.escapeRegex(codeStart)}\\s*loop\\b`),
            new RegExp(`${this.escapeRegex(codeStart)}\\s*match\\b`),
            new RegExp(`${this.escapeRegex(codeStart)}\\s*micro\\b`),
            new RegExp(`${this.escapeRegex(codeStart)}\\s*else\\s*if\\b`),
            new RegExp(`${this.escapeRegex(codeStart)}\\s*else\\b`),
        ];

        const decreaseIndentPatterns = [
            new RegExp(`${this.escapeRegex(codeStart)}\\s*end\\s+if\\b`),
            new RegExp(`${this.escapeRegex(codeStart)}\\s*end\\s+loop\\b`),
            new RegExp(`${this.escapeRegex(codeStart)}\\s*end\\s+match\\b`),
            new RegExp(`${this.escapeRegex(codeStart)}\\s*end\\s+micro\\b`),
            new RegExp(`${this.escapeRegex(codeStart)}\\s*else\\s*if\\b`),
            new RegExp(`${this.escapeRegex(codeStart)}\\s*else\\b`),
        ];

        for (const line of lines) {
            let shouldDecreaseFirst = false;

            for (const pattern of decreaseIndentPatterns) {
                if (pattern.test(line)) {
                    shouldDecreaseFirst = true;
                    break;
                }
            }

            if (shouldDecreaseFirst && indentLevel > 0) {
                indentLevel--;
            }

            result.push(indentStr.repeat(indentLevel) + line.trimStart());

            for (const pattern of increaseIndentPatterns) {
                if (pattern.test(line)) {
                    indentLevel++;
                    break;
                }
            }
        }

        return result.join("\n");
    }

    private preserveNewlines(content: string): string {
        let result = content;

        result = result.replace(/\n{3,}/g, "\n\n");

        return result;
    }

    private formatSpacing(
        content: string,
        languageConfig: LanguageConfig,
    ): string {
        const codeStart = languageConfig.codeStart;
        const codeEnd = languageConfig.codeEnd;

        let result = content;

        result = result.replace(
            new RegExp(
                this.escapeRegex(codeStart) +
                    "\\s*" +
                    this.escapeRegex(codeEnd),
                "g",
            ),
            `${codeStart} ${codeEnd}`,
        );

        result = result.replace(/\s+=\s+/g, " = ");
        result = result.replace(/\s*,\s+/g, ", ");
        result = result.replace(/\s*\(\s+/g, "(");
        result = result.replace(/\s+\)/g, ")");

        return result;
    }

    /**
     * 转义正则表达式特殊字符
     * @param str 原始字符串
     * @returns 转义后的字符串
     */
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
}

class CodeActionProvider {
    public getCodeActions(
        document: TextDocument,
        range: Range,
        context: CodeActionContext,
        cachedDoc: CachedDocument | undefined,
    ): CodeAction[] {
        const actions: CodeAction[] = [];

        for (const diagnostic of context.diagnostics) {
            const fixActions = this.createQuickFixes(
                document,
                diagnostic,
                cachedDoc,
            );
            actions.push(...fixActions);
        }

        actions.push(...this.createRefactorActions(document, range, cachedDoc));

        return actions;
    }

    /**
     * 创建快速修复操作
     * @param document 文档对象
     * @param diagnostic 诊断信息
     * @param cachedDoc 缓存文档
     * @returns 快速修复操作列表
     */
    private createQuickFixes(
        document: TextDocument,
        diagnostic: Diagnostic,
        cachedDoc: CachedDocument | undefined,
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        const errorCode = diagnostic.code as ErrorCode;
        const message = diagnostic.message.toLowerCase();

        if (errorCode === ErrorCode.SyntaxError || message.includes("语法")) {
            actions.push(...this.createSyntaxErrorFixes(document, diagnostic));
        }

        if (
            errorCode === ErrorCode.DelimiterMismatch ||
            message.includes("定界符不匹配")
        ) {
            actions.push(this.createDelimiterMismatchFix(document, diagnostic));
        }

        if (
            errorCode === ErrorCode.UnclosedString ||
            message.includes("未闭合的字符串")
        ) {
            actions.push(this.createUnclosedStringFix(document, diagnostic));
        }

        if (
            errorCode === ErrorCode.UnclosedComment ||
            message.includes("未闭合的注释")
        ) {
            actions.push(this.createUnclosedCommentFix(document, diagnostic));
        }

        if (
            errorCode === ErrorCode.UnclosedDelimiter ||
            message.includes("未闭合的定界符")
        ) {
            actions.push(this.createUnclosedDelimiterFix(document, diagnostic));
        }

        if (
            errorCode === ErrorCode.MissingEnd ||
            message.includes("缺少结束")
        ) {
            const missingEndFix = this.createMissingEndFix(
                document,
                diagnostic,
                cachedDoc,
            );
            if (missingEndFix) {
                actions.push(missingEndFix);
            }
        }

        if (
            errorCode === ErrorCode.UndefinedVariable ||
            message.includes("未定义的变量")
        ) {
            const varFix = this.createUndefinedVariableFix(
                document,
                diagnostic,
                cachedDoc,
            );
            if (varFix) {
                actions.push(varFix);
            }
        }

        if (
            errorCode === ErrorCode.UndefinedFunction ||
            message.includes("未定义的函数")
        ) {
            actions.push(
                ...this.createUndefinedFunctionFixes(
                    document,
                    diagnostic,
                    cachedDoc,
                ),
            );
        }

        if (
            errorCode === ErrorCode.InvalidIdentifier ||
            message.includes("无效的标识符")
        ) {
            actions.push(this.createInvalidIdentifierFix(document, diagnostic));
        }

        if (
            errorCode === ErrorCode.InvalidExpression ||
            message.includes("无效的表达式")
        ) {
            actions.push(
                ...this.createInvalidExpressionFixes(document, diagnostic),
            );
        }

        if (
            errorCode === ErrorCode.TypeMismatch ||
            message.includes("类型不匹配")
        ) {
            actions.push(
                ...this.createTypeMismatchFixes(
                    document,
                    diagnostic,
                    cachedDoc,
                ),
            );
        }

        if (
            errorCode === ErrorCode.InvalidOperator ||
            message.includes("无效的运算符")
        ) {
            actions.push(this.createInvalidOperatorFix(document, diagnostic));
        }

        if (
            errorCode === ErrorCode.MissingOperator ||
            message.includes("缺少运算符")
        ) {
            actions.push(
                ...this.createMissingOperatorFixes(document, diagnostic),
            );
        }

        actions.push(this.createDocumentationAction(diagnostic));
        actions.push(this.createShowFixSuggestionAction(diagnostic));

        return actions;
    }

    /**
     * 创建语法错误修复建议列表
     * @param document 文档对象
     * @param diagnostic 诊断信息
     * @returns 修复操作列表
     */
    private createSyntaxErrorFixes(
        _document: TextDocument,
        diagnostic: Diagnostic,
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        const message = diagnostic.message.toLowerCase();

        if (message.includes("缺少") || message.includes("missing")) {
            actions.push({
                title: "查看语法错误文档",
                kind: CodeActionKind.QuickFix,
                diagnostics: [diagnostic],
                command: {
                    title: "打开文档",
                    command: "vscode.open",
                    arguments: [
                        generateDocumentationUrl(ErrorCode.SyntaxError),
                    ],
                },
            });
        }

        actions.push({
            title: "检查语法结构",
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            command: {
                title: "打开语法说明",
                command: "vscode.open",
                arguments: ["https://docs.doki.engine/syntax"],
            },
        });

        return actions;
    }

    /**
     * 创建未定义函数修复建议列表
     * @param document 文档对象
     * @param diagnostic 诊断信息
     * @param cachedDoc 缓存文档
     * @returns 修复操作列表
     */
    private createUndefinedFunctionFixes(
        document: TextDocument,
        diagnostic: Diagnostic,
        _cachedDoc: CachedDocument | undefined,
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        const content = document.getText();
        const range = diagnostic.range;

        const lineStart = document.offsetAt(
            Position.create(range.start.line, 0),
        );
        const lineEnd = document.offsetAt(
            Position.create(range.start.line + 1, 0),
        );
        const lineContent = content.substring(lineStart, lineEnd);

        const funcMatch = lineContent.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
        if (!funcMatch) {
            return actions;
        }

        const funcName = funcMatch[1];
        const languageManager = LanguageConfigManager.getInstance();
        const config = languageManager.getLanguageFromUri(document.uri);

        actions.push({
            title: `创建微函数 '${funcName}'`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            edit: {
                changes: {
                    [document.uri]: [
                        TextEdit.insert(
                            Position.create(0, 0),
                            `${config.codeStart} micro ${funcName}() ${config.codeEnd}\n${config.codeStart} end micro ${config.codeEnd}\n`,
                        ),
                    ],
                },
            },
        });

        const builtinAlternatives = this.findSimilarBuiltinFunction(funcName);
        for (const alt of builtinAlternatives) {
            actions.push({
                title: `使用内置函数 '${alt}' 替代`,
                kind: CodeActionKind.QuickFix,
                diagnostics: [diagnostic],
                edit: {
                    changes: {
                        [document.uri]: [TextEdit.replace(range, `${alt}()`)],
                    },
                },
            });
        }

        return actions;
    }

    /**
     * 查找相似的内置函数
     * @param funcName 函数名
     * @returns 相似的内置函数列表
     */
    private findSimilarBuiltinFunction(funcName: string): string[] {
        const builtins = [
            "len",
            "upper",
            "lower",
            "trim",
            "split",
            "join",
            "replace",
            "substr",
            "slice",
            "keys",
            "values",
            "items",
            "range",
            "int",
            "float",
            "str",
            "bool",
            "list",
            "dict",
            "min",
            "max",
            "sum",
            "abs",
            "round",
            "floor",
            "ceil",
            "sort",
            "reverse",
            "map",
            "filter",
            "reduce",
            "find",
            "any",
            "all",
            "enumerate",
            "zip",
        ];

        const lowerFuncName = funcName.toLowerCase();

        return builtins
            .filter((b) => {
                if (b.includes(lowerFuncName) || lowerFuncName.includes(b)) {
                    return true;
                }
                const distance = this.levenshteinDistance(lowerFuncName, b);
                return distance <= 2;
            })
            .slice(0, 3);
    }

    /**
     * 计算编辑距离
     * @param a 字符串 a
     * @param b 字符串 b
     * @returns 编辑距离
     */
    private levenshteinDistance(a: string, b: string): number {
        const matrix: number[][] = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1,
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    /**
     * 创建无效标识符修复
     * @param document 文档对象
     * @param diagnostic 诊断信息
     * @returns 修复操作
     */
    private createInvalidIdentifierFix(
        document: TextDocument,
        diagnostic: Diagnostic,
    ): CodeAction {
        const content = document.getText();
        const range = diagnostic.range;
        const offset = document.offsetAt(range.start);

        let identifier = "";
        let start = offset;
        while (start >= 0 && /[a-zA-Z0-9_]/.test(content[start])) {
            start--;
        }
        start++;

        let end = offset;
        while (end < content.length && /[a-zA-Z0-9_]/.test(content[end])) {
            end++;
        }
        identifier = content.substring(start, end);

        const fixedIdentifier = identifier.replace(/^[0-9]+/, "_");

        return {
            title: `修复标识符为 '${fixedIdentifier}'`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            edit: {
                changes: {
                    [document.uri]: [
                        TextEdit.replace(
                            Range.create(
                                document.positionAt(start),
                                document.positionAt(end),
                            ),
                            fixedIdentifier,
                        ),
                    ],
                },
            },
        };
    }

    /**
     * 创建无效表达式修复建议列表
     * @param document 文档对象
     * @param diagnostic 诊断信息
     * @returns 修复操作列表
     */
    private createInvalidExpressionFixes(
        _document: TextDocument,
        diagnostic: Diagnostic,
    ): CodeAction[] {
        const actions: CodeAction[] = [];

        actions.push({
            title: "查看表达式语法文档",
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            command: {
                title: "打开文档",
                command: "vscode.open",
                arguments: [
                    generateDocumentationUrl(ErrorCode.InvalidExpression),
                ],
            },
        });

        return actions;
    }

    /**
     * 创建类型不匹配修复建议列表
     * @param document 文档对象
     * @param diagnostic 诊断信息
     * @param cachedDoc 缓存文档
     * @returns 修复操作列表
     */
    private createTypeMismatchFixes(
        document: TextDocument,
        diagnostic: Diagnostic,
        _cachedDoc: CachedDocument | undefined,
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        const content = document.getText();
        const range = diagnostic.range;

        const lineStart = document.offsetAt(
            Position.create(range.start.line, 0),
        );
        const lineEnd = document.offsetAt(
            Position.create(range.start.line + 1, 0),
        );
        const _lineContent = content.substring(lineStart, lineEnd);

        const typeConversionFuncs = [
            { name: "str", description: "转换为字符串" },
            { name: "int", description: "转换为整数" },
            { name: "float", description: "转换为浮点数" },
            { name: "bool", description: "转换为布尔值" },
        ];

        for (const func of typeConversionFuncs) {
            actions.push({
                title: `使用 ${func.name}() ${func.description}`,
                kind: CodeActionKind.QuickFix,
                diagnostics: [diagnostic],
                edit: {
                    changes: {
                        [document.uri]: [
                            TextEdit.replace(
                                range,
                                `${func.name}(${document.getText(range)})`,
                            ),
                        ],
                    },
                },
            });
        }

        return actions;
    }

    /**
     * 创建无效运算符修复
     * @param document 文档对象
     * @param diagnostic 诊断信息
     * @returns 修复操作
     */
    private createInvalidOperatorFix(
        _document: TextDocument,
        diagnostic: Diagnostic,
    ): CodeAction {
        return {
            title: "查看支持的运算符",
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            command: {
                title: "打开运算符文档",
                command: "vscode.open",
                arguments: [
                    generateDocumentationUrl(ErrorCode.InvalidOperator),
                ],
            },
        };
    }

    /**
     * 创建缺少运算符修复建议列表
     * @param document 文档对象
     * @param diagnostic 诊断信息
     * @returns 修复操作列表
     */
    private createMissingOperatorFixes(
        document: TextDocument,
        diagnostic: Diagnostic,
    ): CodeAction[] {
        const actions: CodeAction[] = [];
        const range = diagnostic.range;

        const operators = [
            "+",
            "-",
            "*",
            "/",
            "=",
            "==",
            "!=",
            "<",
            ">",
            "<=",
            ">=",
        ];

        for (const op of operators) {
            actions.push({
                title: `插入运算符 '${op}'`,
                kind: CodeActionKind.QuickFix,
                diagnostics: [diagnostic],
                edit: {
                    changes: {
                        [document.uri]: [TextEdit.insert(range.end, ` ${op} `)],
                    },
                },
            });
        }

        return actions;
    }

    /**
     * 创建显示修复建议操作
     * @param diagnostic 诊断信息
     * @returns 代码操作
     */
    private createShowFixSuggestionAction(diagnostic: Diagnostic): CodeAction {
        const errorCode = diagnostic.code as ErrorCode;
        const errorConfig =
            ERROR_CONFIGS[errorCode] || ERROR_CONFIGS[ErrorCode.SyntaxError];

        return {
            title: `💡 ${errorConfig.fixSuggestion}`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            command: {
                title: "显示修复建议",
                command: "vscode.window.showInformationMessage",
                arguments: [errorConfig.fixSuggestion],
            },
        };
    }

    /**
     * 创建未闭合字符串修复
     * @param document 文档对象
     * @param diagnostic 诊断信息
     * @returns 修复操作
     */
    private createUnclosedStringFix(
        document: TextDocument,
        diagnostic: Diagnostic,
    ): CodeAction {
        const content = document.getText();
        const range = diagnostic.range;

        const lineStart = document.offsetAt(
            Position.create(range.start.line, 0),
        );
        const lineEnd = document.offsetAt(
            Position.create(range.start.line + 1, 0),
        );
        const lineContent = content.substring(lineStart, lineEnd);

        const quoteMatch = lineContent.match(/"/g);
        const hasSingleQuote = quoteMatch && quoteMatch.length % 2 === 1;

        let insertText = '"';
        let title = '添加结束引号 "';

        if (!hasSingleQuote) {
            insertText = '"';
            title = '添加结束引号 "';
        }

        return {
            title,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            edit: {
                changes: {
                    [document.uri]: [
                        TextEdit.insert(
                            Position.create(
                                range.start.line,
                                lineContent.length - 1,
                            ),
                            insertText,
                        ),
                    ],
                },
            },
        };
    }

    /**
     * 创建未闭合注释修复
     * @param document 文档对象
     * @param diagnostic 诊断信息
     * @returns 修复操作
     */
    private createUnclosedCommentFix(
        document: TextDocument,
        diagnostic: Diagnostic,
    ): CodeAction {
        const languageManager = LanguageConfigManager.getInstance();
        const config = languageManager.getLanguageFromUri(document.uri);

        return {
            title: `添加结束标记 ${config.commentEnd}`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            edit: {
                changes: {
                    [document.uri]: [
                        TextEdit.insert(
                            document.positionAt(document.getText().length),
                            config.commentEnd,
                        ),
                    ],
                },
            },
        };
    }

    /**
     * 创建未闭合定界符修复
     * @param document 文档对象
     * @param diagnostic 诊断信息
     * @returns 修复操作
     */
    private createUnclosedDelimiterFix(
        document: TextDocument,
        diagnostic: Diagnostic,
    ): CodeAction {
        const languageManager = LanguageConfigManager.getInstance();
        const config = languageManager.getLanguageFromUri(document.uri);

        return {
            title: `添加结束标记 ${config.codeEnd}`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            edit: {
                changes: {
                    [document.uri]: [
                        TextEdit.insert(
                            document.positionAt(document.getText().length),
                            config.codeEnd,
                        ),
                    ],
                },
            },
        };
    }

    /**
     * 创建缺少结束语句修复
     * @param document 文档对象
     * @param diagnostic 诊断信息
     * @param cachedDoc 缓存文档
     * @returns 修复操作或 null
     */
    private createMissingEndFix(
        document: TextDocument,
        diagnostic: Diagnostic,
        _cachedDoc: CachedDocument | undefined,
    ): CodeAction | null {
        const content = document.getText();
        const range = diagnostic.range;

        const lineStart = document.offsetAt(
            Position.create(range.start.line, 0),
        );
        const lineEnd = document.offsetAt(
            Position.create(range.start.line + 1, 0),
        );
        const lineContent = content.substring(lineStart, lineEnd);

        const constructMatch = lineContent.match(
            /(if|loop|match|micro|block|prepend|append)\b/,
        );
        if (!constructMatch) {
            return null;
        }

        const construct = constructMatch[1];
        const languageManager = LanguageConfigManager.getInstance();
        const config = languageManager.getLanguageFromUri(document.uri);

        const endStatement = `${config.codeStart} end ${construct} ${config.codeEnd}`;

        return {
            title: `添加 end ${construct}`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            edit: {
                changes: {
                    [document.uri]: [
                        TextEdit.insert(
                            Position.create(range.end.line + 1, 0),
                            `${endStatement}\n`,
                        ),
                    ],
                },
            },
        };
    }

    /**
     * 创建定界符不匹配修复
     * @param document 文档对象
     * @param diagnostic 诊断信息
     * @returns 修复操作
     */
    private createDelimiterMismatchFix(
        document: TextDocument,
        diagnostic: Diagnostic,
    ): CodeAction {
        const content = document.getText();
        const languageManager = LanguageConfigManager.getInstance();
        const config = languageManager.getLanguageFromUri(document.uri);

        const openCode = (
            content.match(
                new RegExp(this.escapeRegex(config.codeStart), "g"),
            ) || []
        ).length;
        const closeCode = (
            content.match(new RegExp(this.escapeRegex(config.codeEnd), "g")) ||
            []
        ).length;

        let insertText = "";
        let title = "";

        if (openCode > closeCode) {
            insertText = config.codeEnd;
            title = `添加缺失的结束定界符 ${config.codeEnd}`;
        } else if (closeCode > openCode) {
            insertText = config.codeStart;
            title = `添加缺失的开始定界符 ${config.codeStart}`;
        } else {
            title = "修复定界符问题";
        }

        return {
            title,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            edit: {
                changes: {
                    [document.uri]: [
                        TextEdit.insert(
                            document.positionAt(content.length),
                            insertText,
                        ),
                    ],
                },
            },
        };
    }

    /**
     * 创建未定义变量修复
     * @param document 文档对象
     * @param diagnostic 诊断信息
     * @param cachedDoc 缓存文档
     * @returns 修复操作或 null
     */
    private createUndefinedVariableFix(
        document: TextDocument,
        diagnostic: Diagnostic,
        cachedDoc: CachedDocument | undefined,
    ): CodeAction | null {
        const content = document.getText();
        const range = diagnostic.range;
        const lineStart = document.offsetAt(
            Position.create(range.start.line, 0),
        );
        const lineEnd = document.offsetAt(
            Position.create(range.start.line + 1, 0),
        );
        const lineContent = content.substring(lineStart, lineEnd);

        const varMatch = lineContent.match(/[a-zA-Z_][a-zA-Z0-9_]*/);
        if (!varMatch) {
            return null;
        }

        const varName = varMatch[0];
        const languageManager = LanguageConfigManager.getInstance();
        const config = languageManager.getLanguageFromUri(document.uri);

        const inferredType = this.inferVariableType(varName, cachedDoc);
        const defaultValue = this.getDefaultValueForType(inferredType);

        return {
            title: `声明变量 '${varName}' (推断类型: ${inferredType})`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            edit: {
                changes: {
                    [document.uri]: [
                        TextEdit.insert(
                            Position.create(range.start.line, 0),
                            `${config.codeStart} let ${varName} = ${defaultValue} ${config.codeEnd}\n`,
                        ),
                    ],
                },
            },
        };
    }

    /**
     * 推断变量类型
     * @param varName 变量名
     * @param cachedDoc 缓存文档
     * @returns 推断的类型字符串
     */
    private inferVariableType(
        varName: string,
        cachedDoc: CachedDocument | undefined,
    ): string {
        if (!cachedDoc) {
            return "unknown";
        }

        if (
            varName.startsWith("is") ||
            varName.startsWith("has") ||
            varName.startsWith("can")
        ) {
            return "boolean";
        }

        if (
            varName.startsWith("num") ||
            varName.endsWith("Count") ||
            varName.endsWith("Index")
        ) {
            return "number";
        }

        if (
            varName.endsWith("List") ||
            varName.endsWith("Array") ||
            varName.endsWith("s")
        ) {
            return "array";
        }

        if (
            varName.endsWith("Name") ||
            varName.endsWith("Text") ||
            varName.endsWith("Str")
        ) {
            return "string";
        }

        return "unknown";
    }

    /**
     * 获取类型的默认值
     * @param type 类型名称
     * @returns 默认值字符串
     */
    private getDefaultValueForType(type: string): string {
        switch (type) {
            case "number":
                return "0";
            case "string":
                return '""';
            case "boolean":
                return "false";
            case "array":
                return "[]";
            case "object":
                return "{}";
            default:
                return "null";
        }
    }

    /**
     * 创建查看文档操作
     * @param diagnostic 诊断信息
     * @returns 代码操作
     */
    private createDocumentationAction(diagnostic: Diagnostic): CodeAction {
        const errorCode = diagnostic.code as ErrorCode;
        const errorConfig =
            ERROR_CONFIGS[errorCode] || ERROR_CONFIGS[ErrorCode.SyntaxError];

        return {
            title: `查看错误 [${errorCode}] 的文档`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            command: {
                title: "打开错误文档",
                command: "vscode.open",
                arguments: [errorConfig.documentationUrl],
            },
        };
    }

    /**
     * 创建重构操作
     * @param document 文档对象
     * @param range 范围
     * @param cachedDoc 缓存文档
     * @returns 重构操作列表
     */
    private createRefactorActions(
        document: TextDocument,
        range: Range,
        cachedDoc: CachedDocument | undefined,
    ): CodeAction[] {
        const actions: CodeAction[] = [];

        if (!cachedDoc) {
            return actions;
        }

        const _content = document.getText();
        const rangeContent = document.getText(range);

        if (rangeContent.trim()) {
            actions.push({
                title: "提取为变量",
                kind: CodeActionKind.RefactorExtract,
                edit: this.createExtractVariableEdit(
                    document,
                    range,
                    rangeContent,
                    cachedDoc,
                ),
            });

            actions.push({
                title: "提取为微函数",
                kind: CodeActionKind.RefactorExtract,
                edit: this.createExtractFunctionEdit(
                    document,
                    range,
                    rangeContent,
                    cachedDoc,
                ),
            });
        }

        return actions;
    }

    /**
     * 创建提取变量编辑
     * @param document 文档对象
     * @param range 范围
     * @param expression 表达式内容
     * @param cachedDoc 缓存文档
     * @returns 工作区编辑
     */
    private createExtractVariableEdit(
        document: TextDocument,
        range: Range,
        expression: string,
        _cachedDoc: CachedDocument,
    ): WorkspaceEdit | undefined {
        const languageManager = LanguageConfigManager.getInstance();
        const config = languageManager.getLanguageFromUri(document.uri);

        const varName = "extracted";

        return {
            changes: {
                [document.uri]: [
                    TextEdit.insert(
                        Position.create(range.start.line, 0),
                        `${config.codeStart} let ${varName} = ${expression.trim()} ${config.codeEnd}\n`,
                    ),
                    TextEdit.replace(range, varName),
                ],
            },
        };
    }

    /**
     * 创建提取函数编辑
     * @param document 文档对象
     * @param range 范围
     * @param expression 表达式内容
     * @param cachedDoc 缓存文档
     * @returns 工作区编辑
     */
    private createExtractFunctionEdit(
        document: TextDocument,
        range: Range,
        expression: string,
        _cachedDoc: CachedDocument,
    ): WorkspaceEdit | undefined {
        const languageManager = LanguageConfigManager.getInstance();
        const config = languageManager.getLanguageFromUri(document.uri);

        const funcName = "extractedFunc";

        return {
            changes: {
                [document.uri]: [
                    TextEdit.insert(
                        Position.create(0, 0),
                        `${config.codeStart} micro ${funcName}() ${config.codeEnd}\n${expression.trim()}\n${config.codeStart} end micro ${config.codeEnd}\n`,
                    ),
                    TextEdit.replace(range, `${funcName}()`),
                ],
            },
        };
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
}

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const documentManager = new DocumentManager();
const configManager = ConfigManager.getInstance();
const diagnosticManager = new DiagnosticManager(documentManager);
const completionProvider = new CompletionProvider();
const templateInheritanceAnalyzer = new TemplateInheritanceAnalyzer(
    documentManager,
);
const hoverProvider = new HoverProvider();
hoverProvider.setInheritanceAnalyzer(templateInheritanceAnalyzer);
const documentSymbolProvider = new DocumentSymbolProvider();
const definitionProvider = new DefinitionProvider();
const referencesProvider = new ReferencesProvider();
const documentHighlightProvider = new DocumentHighlightProvider();
const renameProvider = new RenameProvider();
const semanticTokensProvider = new SemanticTokensProvider();
const formattingProvider = new FormattingProvider();
const codeActionProvider = new CodeActionProvider();

configManager.setConnection(connection);

connection.onInitialize((_params: InitializeParams): InitializeResult => {
    return {
        capabilities: {
            textDocumentSync: 1,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ["{", "l", "i", "f", "|", ".", " "],
            },
            hoverProvider: true,
            documentSymbolProvider: true,
            definitionProvider: true,
            referencesProvider: true,
            documentHighlightProvider: true,
            renameProvider: {
                prepareProvider: true,
            },
            semanticTokensProvider: {
                legend: semanticTokensProvider.getLegend(),
                full: true,
            },
            documentFormattingProvider: true,
            documentRangeFormattingProvider: true,
            codeActionProvider: {
                codeActionKinds: [
                    CodeActionKind.QuickFix,
                    CodeActionKind.Refactor,
                    CodeActionKind.RefactorExtract,
                ],
            },
        },
    };
});

connection.onInitialized(async () => {
    const config = await connection.workspace.getConfiguration([
        { section: "doki.format" },
        { section: "doki.diagnostics" },
        { section: "doki.completion" },
        { section: "doki.templates" },
    ]);

    if (config) {
        const vscodeConfig: Record<string, unknown> = {};
        if (config[0]) {
            vscodeConfig["doki.format.indentSize"] = (
                config[0] as Record<string, unknown>
            ).indentSize;
            vscodeConfig["doki.format.preserveNewlines"] = (
                config[0] as Record<string, unknown>
            ).preserveNewlines;
        }
        if (config[1]) {
            vscodeConfig["doki.diagnostics.enabled"] = (
                config[1] as Record<string, unknown>
            ).enabled;
            vscodeConfig["doki.diagnostics.severity"] = (
                config[1] as Record<string, unknown>
            ).severity;
        }
        if (config[2]) {
            vscodeConfig["doki.completion.enabled"] = (
                config[2] as Record<string, unknown>
            ).enabled;
            vscodeConfig["doki.completion.snippets"] = (
                config[2] as Record<string, unknown>
            ).snippets;
        }
        if (config[3]) {
            vscodeConfig["doki.templates.includes"] = (
                config[3] as Record<string, unknown>
            ).includes;
        }
        const parsedConfig = configManager.parseFromVscodeConfig(vscodeConfig);
        configManager.updateConfig(parsedConfig);
    }
});

connection.onDidChangeConfiguration(async (_change) => {
    const config = await connection.workspace.getConfiguration([
        { section: "doki.format" },
        { section: "doki.diagnostics" },
        { section: "doki.completion" },
        { section: "doki.templates" },
    ]);

    if (config) {
        const vscodeConfig: Record<string, unknown> = {};
        if (config[0]) {
            vscodeConfig["doki.format.indentSize"] = (
                config[0] as Record<string, unknown>
            ).indentSize;
            vscodeConfig["doki.format.preserveNewlines"] = (
                config[0] as Record<string, unknown>
            ).preserveNewlines;
        }
        if (config[1]) {
            vscodeConfig["doki.diagnostics.enabled"] = (
                config[1] as Record<string, unknown>
            ).enabled;
            vscodeConfig["doki.diagnostics.severity"] = (
                config[1] as Record<string, unknown>
            ).severity;
        }
        if (config[2]) {
            vscodeConfig["doki.completion.enabled"] = (
                config[2] as Record<string, unknown>
            ).enabled;
            vscodeConfig["doki.completion.snippets"] = (
                config[2] as Record<string, unknown>
            ).snippets;
        }
        if (config[3]) {
            vscodeConfig["doki.templates.includes"] = (
                config[3] as Record<string, unknown>
            ).includes;
        }
        const parsedConfig = configManager.parseFromVscodeConfig(vscodeConfig);
        configManager.updateConfig(parsedConfig);
    }

    for (const document of documents.all()) {
        const diagnostics = diagnosticManager.getDiagnostics(document);
        connection.sendDiagnostics({
            uri: document.uri,
            diagnostics,
        });
    }
});

connection.onDidChangeTextDocument((params: DidChangeTextDocumentParams) => {
    const document = documents.get(params.textDocument.uri);
    if (document) {
        const diagnostics = diagnosticManager.getDiagnostics(document);
        connection.sendDiagnostics({
            uri: params.textDocument.uri,
            diagnostics,
        });
    }
});

connection.onDidCloseTextDocument((params) => {
    documentManager.clearDocument(params.textDocument.uri);
});

connection.onCompletion((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document) {
        const cachedDoc = documentManager.parseDocument(document);
        return completionProvider.getCompletions(
            cachedDoc,
            params.position,
            document,
        );
    }
    return completionProvider.getCompletions(undefined, params.position);
});

connection.onCompletionResolve((item: CompletionItem) => {
    return item;
});

connection.onHover((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document) {
        const cachedDoc = documentManager.parseDocument(document);
        return hoverProvider.getHover(document, params.position, cachedDoc);
    }
    return null;
});

connection.onDocumentSymbol((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document) {
        const cachedDoc = documentManager.parseDocument(document);
        return documentSymbolProvider.getSymbols(document, cachedDoc);
    }
    return [];
});

connection.onDefinition((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document) {
        const cachedDoc = documentManager.parseDocument(document);
        return definitionProvider.getDefinition(
            document,
            params.position,
            cachedDoc,
        );
    }
    return null;
});

connection.onReferences((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document) {
        const cachedDoc = documentManager.parseDocument(document);
        return referencesProvider.getReferences(
            document,
            params.position,
            cachedDoc,
        );
    }
    return [];
});

connection.onDocumentHighlight((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document) {
        const cachedDoc = documentManager.parseDocument(document);
        return documentHighlightProvider.getHighlights(
            document,
            params.position,
            cachedDoc,
        );
    }
    return [];
});

connection.onRenameRequest((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document) {
        const cachedDoc = documentManager.parseDocument(document);
        return renameProvider.getRenameEdits(
            document,
            params.position,
            params.newName,
            cachedDoc,
        );
    }
    return null;
});

connection.languages.semanticTokens.on((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document) {
        const cachedDoc = documentManager.parseDocument(document);
        return {
            data: semanticTokensProvider.getSemanticTokens(document, cachedDoc),
        };
    }
    return { data: [] };
});

connection.onDocumentFormatting((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document) {
        return formattingProvider.formatDocument(document, params);
    }
    return [];
});

connection.onDocumentRangeFormatting((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document) {
        return formattingProvider.formatRange(document, params);
    }
    return [];
});

connection.onCodeAction((params) => {
    const document = documents.get(params.textDocument.uri);
    if (document) {
        const cachedDoc = documentManager.parseDocument(document);
        return codeActionProvider.getCodeActions(
            document,
            params.range,
            params.context,
            cachedDoc,
        );
    }
    return [];
});

documents.listen(connection);
connection.listen();

console.log("Doki LSP Server started");
