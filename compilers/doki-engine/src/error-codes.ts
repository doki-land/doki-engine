/**
 * Doki Engine CLI 错误代码定义
 *
 * 提供统一的错误代码枚举和元数据，支持错误查询和文档链接。
 */

/**
 * 错误严重程度
 */
export type ErrorSeverity = "error" | "warning" | "hint";

/**
 * CLI 错误代码枚举
 *
 * 命名规范：
 * - E0xx: 词法/语法错误 (继承自 DejaVu Engine)
 * - E1xx: 语义/运行时错误 (继承自 DejaVu Engine)
 * - E2xx: CLI/配置错误
 * - E3xx: IO/系统错误
 * - E4xx: 内容处理错误
 * - E5xx: 构建错误
 * - E6xx: 运行时/服务器错误
 */
export enum CliErrorCode {
    // E0xx - 词法/语法错误 (继承自 DejaVu Engine)
    UNEXPECTED_TOKEN = "E001",
    EXPECTED_TOKEN = "E002",
    UNCLOSED_STRING = "E003",
    UNCLOSED_COMMENT = "E004",
    UNCLOSED_DELIMITER = "E005",
    INVALID_IDENTIFIER = "E006",
    INVALID_NUMBER = "E007",
    INVALID_EXPRESSION = "E008",
    MISSING_END = "E009",

    // E1xx - 语义/运行时错误 (继承自 DejaVu Engine)
    UNDEFINED_VARIABLE = "E010",
    UNDEFINED_FUNCTION = "E011",
    TEMPLATE_NOT_FOUND = "E012",
    INVALID_ASSIGNMENT = "E013",
    INVALID_OPERATOR = "E014",
    MISSING_OPERATOR = "E015",
    INVALID_TYPE = "E016",
    CIRCULAR_REFERENCE = "E017",

    // E2xx - CLI/配置错误
    CONFIG_NOT_FOUND = "E200",
    CONFIG_PARSE_ERROR = "E201",
    CONFIG_VALIDATION_ERROR = "E202",
    INVALID_COMMAND_OPTION = "E203",
    MISSING_ARGUMENT = "E204",
    UNKNOWN_COMMAND = "E205",

    // E3xx - IO/系统错误
    FILE_NOT_FOUND = "E300",
    FILE_READ_ERROR = "E301",
    FILE_WRITE_ERROR = "E302",
    DIRECTORY_ERROR = "E303",
    PERMISSION_DENIED = "E304",
    STATIC_COPY_ERROR = "E305",

    // E4xx - 内容处理错误
    CONTENT_PARSE_ERROR = "E400",
    FRONTMATTER_ERROR = "E401",
    MARKDOWN_ERROR = "E402",
    ENCODING_ERROR = "E403",

    // E5xx - 构建错误
    BUILD_FAILED = "E500",
    TEMPLATE_LOAD_ERROR = "E501",
    RENDER_ERROR = "E502",
    OUTPUT_ERROR = "E503",
    TAXONOMY_ERROR = "E504",

    // E6xx - 运行时/服务器错误
    SERVER_START_ERROR = "E600",
    PORT_IN_USE = "E601",
    WATCH_ERROR = "E602",
    WEBSOCKET_ERROR = "E603",
    BROWSER_OPEN_ERROR = "E604",
}

/**
 * 错误代码元数据
 */
export interface ErrorCodeMetadata {
    /** 错误代码 */
    code: CliErrorCode;
    /** 错误标题 */
    title: string;
    /** 错误描述模板 */
    description: string;
    /** 默认严重程度 */
    severity: ErrorSeverity;
    /** 文档链接 */
    documentationUrl?: string;
    /** 是否可恢复 */
    recoverable: boolean;
}

/**
 * 错误代码元数据映射
 */
export const ErrorCodeMeta: Record<CliErrorCode, ErrorCodeMetadata> = {
    // E0xx - 词法/语法错误
    [CliErrorCode.UNEXPECTED_TOKEN]: {
        code: CliErrorCode.UNEXPECTED_TOKEN,
        title: "意外的标记",
        description: "遇到了意外的标记 {token}，期望 {expected}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates/syntax",
        recoverable: true,
    },
    [CliErrorCode.EXPECTED_TOKEN]: {
        code: CliErrorCode.EXPECTED_TOKEN,
        title: "缺少标记",
        description: "期望 {expected}，但发现了 {found}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates/syntax",
        recoverable: true,
    },
    [CliErrorCode.UNCLOSED_STRING]: {
        code: CliErrorCode.UNCLOSED_STRING,
        title: "未闭合的字符串",
        description: "字符串字面量未闭合，缺少结束引号",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates/syntax",
        recoverable: true,
    },
    [CliErrorCode.UNCLOSED_COMMENT]: {
        code: CliErrorCode.UNCLOSED_COMMENT,
        title: "未闭合的注释",
        description: "注释未闭合，缺少结束标记 {end}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates/syntax",
        recoverable: true,
    },
    [CliErrorCode.UNCLOSED_DELIMITER]: {
        code: CliErrorCode.UNCLOSED_DELIMITER,
        title: "未闭合的定界符",
        description: "模板定界符未闭合，缺少结束标记 {end}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates/syntax",
        recoverable: true,
    },
    [CliErrorCode.INVALID_IDENTIFIER]: {
        code: CliErrorCode.INVALID_IDENTIFIER,
        title: "无效的标识符",
        description: "无效的标识符 {identifier}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates/syntax",
        recoverable: true,
    },
    [CliErrorCode.INVALID_NUMBER]: {
        code: CliErrorCode.INVALID_NUMBER,
        title: "无效的数字",
        description: "无效的数字字面量 {value}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates/syntax",
        recoverable: true,
    },
    [CliErrorCode.INVALID_EXPRESSION]: {
        code: CliErrorCode.INVALID_EXPRESSION,
        title: "无效的表达式",
        description: "无效的表达式: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates/syntax",
        recoverable: true,
    },
    [CliErrorCode.MISSING_END]: {
        code: CliErrorCode.MISSING_END,
        title: "缺少结束语句",
        description: "{construct} 语句缺少对应的 end {construct}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates/syntax",
        recoverable: true,
    },

    // E1xx - 语义/运行时错误
    [CliErrorCode.UNDEFINED_VARIABLE]: {
        code: CliErrorCode.UNDEFINED_VARIABLE,
        title: "未定义的变量",
        description: "变量 {name} 未定义",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates/variables",
        recoverable: true,
    },
    [CliErrorCode.UNDEFINED_FUNCTION]: {
        code: CliErrorCode.UNDEFINED_FUNCTION,
        title: "未定义的函数",
        description: "函数 {name} 未定义",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates/functions",
        recoverable: true,
    },
    [CliErrorCode.TEMPLATE_NOT_FOUND]: {
        code: CliErrorCode.TEMPLATE_NOT_FOUND,
        title: "模板未找到",
        description: "模板 {name} 未找到",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates",
        recoverable: true,
    },
    [CliErrorCode.INVALID_ASSIGNMENT]: {
        code: CliErrorCode.INVALID_ASSIGNMENT,
        title: "无效的赋值",
        description: "无法对表达式进行赋值",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates/variables",
        recoverable: true,
    },
    [CliErrorCode.INVALID_OPERATOR]: {
        code: CliErrorCode.INVALID_OPERATOR,
        title: "无效的运算符",
        description: "运算符 {operator} 在此上下文中无效",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates/operators",
        recoverable: true,
    },
    [CliErrorCode.MISSING_OPERATOR]: {
        code: CliErrorCode.MISSING_OPERATOR,
        title: "缺少运算符",
        description: "表达式缺少运算符",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates/operators",
        recoverable: true,
    },
    [CliErrorCode.INVALID_TYPE]: {
        code: CliErrorCode.INVALID_TYPE,
        title: "类型错误",
        description: "类型不匹配: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates/types",
        recoverable: true,
    },
    [CliErrorCode.CIRCULAR_REFERENCE]: {
        code: CliErrorCode.CIRCULAR_REFERENCE,
        title: "循环引用",
        description: "检测到循环引用: {chain}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates/inheritance",
        recoverable: false,
    },

    // E2xx - CLI/配置错误
    [CliErrorCode.CONFIG_NOT_FOUND]: {
        code: CliErrorCode.CONFIG_NOT_FOUND,
        title: "配置文件未找到",
        description: "配置文件 {path} 不存在",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/config",
        recoverable: true,
    },
    [CliErrorCode.CONFIG_PARSE_ERROR]: {
        code: CliErrorCode.CONFIG_PARSE_ERROR,
        title: "配置解析错误",
        description: "无法解析配置文件: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/config",
        recoverable: true,
    },
    [CliErrorCode.CONFIG_VALIDATION_ERROR]: {
        code: CliErrorCode.CONFIG_VALIDATION_ERROR,
        title: "配置验证错误",
        description: "配置项 {field} 无效: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/config",
        recoverable: true,
    },
    [CliErrorCode.INVALID_COMMAND_OPTION]: {
        code: CliErrorCode.INVALID_COMMAND_OPTION,
        title: "无效的命令选项",
        description: "选项 {option} 无效: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/cli",
        recoverable: true,
    },
    [CliErrorCode.MISSING_ARGUMENT]: {
        code: CliErrorCode.MISSING_ARGUMENT,
        title: "缺少参数",
        description: "缺少必要参数: {argument}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/cli",
        recoverable: true,
    },
    [CliErrorCode.UNKNOWN_COMMAND]: {
        code: CliErrorCode.UNKNOWN_COMMAND,
        title: "未知命令",
        description: "未知命令: {command}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/cli",
        recoverable: true,
    },

    // E3xx - IO/系统错误
    [CliErrorCode.FILE_NOT_FOUND]: {
        code: CliErrorCode.FILE_NOT_FOUND,
        title: "文件未找到",
        description: "文件 {path} 不存在",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/troubleshooting",
        recoverable: true,
    },
    [CliErrorCode.FILE_READ_ERROR]: {
        code: CliErrorCode.FILE_READ_ERROR,
        title: "文件读取错误",
        description: "无法读取文件 {path}: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/troubleshooting",
        recoverable: true,
    },
    [CliErrorCode.FILE_WRITE_ERROR]: {
        code: CliErrorCode.FILE_WRITE_ERROR,
        title: "文件写入错误",
        description: "无法写入文件 {path}: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/troubleshooting",
        recoverable: true,
    },
    [CliErrorCode.DIRECTORY_ERROR]: {
        code: CliErrorCode.DIRECTORY_ERROR,
        title: "目录操作错误",
        description: "目录操作失败 {path}: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/troubleshooting",
        recoverable: true,
    },
    [CliErrorCode.PERMISSION_DENIED]: {
        code: CliErrorCode.PERMISSION_DENIED,
        title: "权限不足",
        description: "没有权限访问 {path}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/troubleshooting",
        recoverable: true,
    },
    [CliErrorCode.STATIC_COPY_ERROR]: {
        code: CliErrorCode.STATIC_COPY_ERROR,
        title: "静态文件复制错误",
        description: "无法复制静态文件: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/troubleshooting",
        recoverable: true,
    },

    // E4xx - 内容处理错误
    [CliErrorCode.CONTENT_PARSE_ERROR]: {
        code: CliErrorCode.CONTENT_PARSE_ERROR,
        title: "内容解析错误",
        description: "无法解析内容文件 {path}: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/content",
        recoverable: true,
    },
    [CliErrorCode.FRONTMATTER_ERROR]: {
        code: CliErrorCode.FRONTMATTER_ERROR,
        title: "Frontmatter 错误",
        description: "Frontmatter 格式错误 {path}: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/content/frontmatter",
        recoverable: true,
    },
    [CliErrorCode.MARKDOWN_ERROR]: {
        code: CliErrorCode.MARKDOWN_ERROR,
        title: "Markdown 错误",
        description: "Markdown 解析错误 {path}: {detail}",
        severity: "warning",
        documentationUrl: "https://docs.doki.engine/content/markdown",
        recoverable: true,
    },
    [CliErrorCode.ENCODING_ERROR]: {
        code: CliErrorCode.ENCODING_ERROR,
        title: "编码错误",
        description: "文件编码错误 {path}: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/troubleshooting",
        recoverable: true,
    },

    // E5xx - 构建错误
    [CliErrorCode.BUILD_FAILED]: {
        code: CliErrorCode.BUILD_FAILED,
        title: "构建失败",
        description: "构建过程中发生错误: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/build",
        recoverable: true,
    },
    [CliErrorCode.TEMPLATE_LOAD_ERROR]: {
        code: CliErrorCode.TEMPLATE_LOAD_ERROR,
        title: "模板加载错误",
        description: "无法加载模板 {name}: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates",
        recoverable: true,
    },
    [CliErrorCode.RENDER_ERROR]: {
        code: CliErrorCode.RENDER_ERROR,
        title: "渲染错误",
        description: "渲染失败 {path}: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/templates",
        recoverable: true,
    },
    [CliErrorCode.OUTPUT_ERROR]: {
        code: CliErrorCode.OUTPUT_ERROR,
        title: "输出错误",
        description: "无法生成输出文件: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/build",
        recoverable: true,
    },
    [CliErrorCode.TAXONOMY_ERROR]: {
        code: CliErrorCode.TAXONOMY_ERROR,
        title: "分类法错误",
        description: "分类法处理错误: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/taxonomy",
        recoverable: true,
    },

    // E6xx - 运行时/服务器错误
    [CliErrorCode.SERVER_START_ERROR]: {
        code: CliErrorCode.SERVER_START_ERROR,
        title: "服务器启动错误",
        description: "无法启动服务器: {detail}",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/cli/dev",
        recoverable: true,
    },
    [CliErrorCode.PORT_IN_USE]: {
        code: CliErrorCode.PORT_IN_USE,
        title: "端口占用",
        description: "端口 {port} 已被占用",
        severity: "error",
        documentationUrl: "https://docs.doki.engine/cli/dev",
        recoverable: true,
    },
    [CliErrorCode.WATCH_ERROR]: {
        code: CliErrorCode.WATCH_ERROR,
        title: "文件监视错误",
        description: "无法监视文件变更: {detail}",
        severity: "warning",
        documentationUrl: "https://docs.doki.engine/cli/dev",
        recoverable: true,
    },
    [CliErrorCode.WEBSOCKET_ERROR]: {
        code: CliErrorCode.WEBSOCKET_ERROR,
        title: "WebSocket 错误",
        description: "WebSocket 连接错误: {detail}",
        severity: "warning",
        documentationUrl: "https://docs.doki.engine/cli/dev",
        recoverable: true,
    },
    [CliErrorCode.BROWSER_OPEN_ERROR]: {
        code: CliErrorCode.BROWSER_OPEN_ERROR,
        title: "浏览器打开错误",
        description: "无法打开浏览器: {detail}",
        severity: "warning",
        documentationUrl: "https://docs.doki.engine/cli/dev",
        recoverable: true,
    },
};

/**
 * 获取错误代码元数据
 */
export function getErrorCodeMeta(code: CliErrorCode): ErrorCodeMetadata {
    return ErrorCodeMeta[code];
}

/**
 * 获取错误代码文档链接
 */
export function getDocumentationUrl(code: CliErrorCode): string | undefined {
    return ErrorCodeMeta[code]?.documentationUrl;
}

/**
 * 检查错误是否可恢复
 */
export function isRecoverable(code: CliErrorCode): boolean {
    return ErrorCodeMeta[code]?.recoverable ?? false;
}

/**
 * 格式化错误描述（替换模板变量）
 */
export function formatDescription(
    code: CliErrorCode,
    params: Record<string, string> = {},
): string {
    const meta = ErrorCodeMeta[code];
    if (!meta) return `未知错误 (${code})`;

    let description = meta.description;
    for (const [key, value] of Object.entries(params)) {
        description = description.replace(`{${key}}`, value);
    }
    return description;
}
