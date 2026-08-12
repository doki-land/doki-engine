/**
 * Doki Engine 错误建议模板库
 *
 * 为各种错误类型提供具体的修复建议和帮助信息。
 */

import { CliErrorCode } from "./error-codes.js";
import type { ErrorSuggestion } from "./cli-errors.js";

/**
 * 建议模板接口
 */
export interface SuggestionTemplate {
    /** 错误代码 */
    code: CliErrorCode;
    /** 默认建议列表 */
    suggestions: ErrorSuggestion[];
    /** 相关文档 URL */
    documentationUrl?: string;
}

/**
 * 错误建议模板映射
 */
export const SUGGESTION_TEMPLATES: Record<CliErrorCode, SuggestionTemplate> = {
    // E0xx - 词法/语法错误
    [CliErrorCode.UNEXPECTED_TOKEN]: {
        code: CliErrorCode.UNEXPECTED_TOKEN,
        suggestions: [
            { type: "fix", message: "检查模板语法是否正确" },
            { type: "fix", message: "确保所有标签都正确闭合" },
            { type: "fix", message: "检查是否有拼写错误" },
        ],
        documentationUrl: "https://docs.doki.engine/templates/syntax",
    },
    [CliErrorCode.EXPECTED_TOKEN]: {
        code: CliErrorCode.EXPECTED_TOKEN,
        suggestions: [
            { type: "fix", message: "添加缺少的标记" },
            { type: "fix", message: "检查语法结构是否完整" },
        ],
        documentationUrl: "https://docs.doki.engine/templates/syntax",
    },
    [CliErrorCode.UNCLOSED_STRING]: {
        code: CliErrorCode.UNCLOSED_STRING,
        suggestions: [
            { type: "fix", message: "添加结束引号" },
            { type: "fix", message: "检查字符串中是否有转义字符" },
        ],
        documentationUrl: "https://docs.doki.engine/templates/syntax",
    },
    [CliErrorCode.UNCLOSED_COMMENT]: {
        code: CliErrorCode.UNCLOSED_COMMENT,
        suggestions: [
            { type: "fix", message: "添加注释结束标记 #}" },
            { type: "fix", message: "检查注释开始标记 {# 是否正确" },
        ],
        documentationUrl: "https://docs.doki.engine/templates/syntax",
    },
    [CliErrorCode.UNCLOSED_DELIMITER]: {
        code: CliErrorCode.UNCLOSED_DELIMITER,
        suggestions: [
            { type: "fix", message: "添加模板结束标记 %}" },
            { type: "fix", message: "检查模板开始标记 {% 是否正确" },
        ],
        documentationUrl: "https://docs.doki.engine/templates/syntax",
    },
    [CliErrorCode.INVALID_IDENTIFIER]: {
        code: CliErrorCode.INVALID_IDENTIFIER,
        suggestions: [
            { type: "fix", message: "使用有效的标识符名称" },
            { type: "fix", message: "标识符只能包含字母、数字和下划线" },
            { type: "fix", message: "标识符不能以数字开头" },
        ],
        documentationUrl: "https://docs.doki.engine/templates/variables",
    },
    [CliErrorCode.INVALID_NUMBER]: {
        code: CliErrorCode.INVALID_NUMBER,
        suggestions: [
            { type: "fix", message: "检查数字格式是否正确" },
            { type: "fix", message: "确保小数点使用正确" },
        ],
        documentationUrl: "https://docs.doki.engine/templates/syntax",
    },
    [CliErrorCode.INVALID_EXPRESSION]: {
        code: CliErrorCode.INVALID_EXPRESSION,
        suggestions: [
            { type: "fix", message: "检查表达式语法" },
            { type: "fix", message: "确保运算符使用正确" },
            { type: "fix", message: "检查括号是否匹配" },
        ],
        documentationUrl: "https://docs.doki.engine/templates/expressions",
    },
    [CliErrorCode.MISSING_END]: {
        code: CliErrorCode.MISSING_END,
        suggestions: [
            { type: "fix", message: "添加对应的 end 语句" },
            { type: "fix", message: "检查控制流语句是否正确闭合" },
        ],
        documentationUrl: "https://docs.doki.engine/templates/control-flow",
    },

    // E1xx - 语义/运行时错误
    [CliErrorCode.UNDEFINED_VARIABLE]: {
        code: CliErrorCode.UNDEFINED_VARIABLE,
        suggestions: [
            { type: "fix", message: "检查变量名是否拼写正确" },
            { type: "fix", message: "确保变量在使用前已定义" },
            { type: "fix", message: "检查变量作用域" },
        ],
        documentationUrl: "https://docs.doki.engine/templates/variables",
    },
    [CliErrorCode.UNDEFINED_FUNCTION]: {
        code: CliErrorCode.UNDEFINED_FUNCTION,
        suggestions: [
            { type: "fix", message: "检查函数名是否拼写正确" },
            { type: "fix", message: "确保函数已注册" },
            {
                type: "reference",
                message: "查看可用函数列表",
                url: "https://docs.doki.engine/templates/functions",
            },
        ],
        documentationUrl: "https://docs.doki.engine/templates/functions",
    },
    [CliErrorCode.TEMPLATE_NOT_FOUND]: {
        code: CliErrorCode.TEMPLATE_NOT_FOUND,
        suggestions: [
            { type: "fix", message: "检查模板名称是否正确" },
            { type: "fix", message: "确保模板文件存在" },
            { type: "fix", message: "检查模板目录配置" },
        ],
        documentationUrl: "https://docs.doki.engine/templates",
    },
    [CliErrorCode.INVALID_ASSIGNMENT]: {
        code: CliErrorCode.INVALID_ASSIGNMENT,
        suggestions: [
            { type: "fix", message: "检查赋值目标是否有效" },
            { type: "fix", message: "不能对表达式或字面量赋值" },
        ],
        documentationUrl: "https://docs.doki.engine/templates/variables",
    },
    [CliErrorCode.INVALID_OPERATOR]: {
        code: CliErrorCode.INVALID_OPERATOR,
        suggestions: [
            { type: "fix", message: "检查运算符是否适用于当前类型" },
            { type: "fix", message: "确保操作数类型正确" },
        ],
        documentationUrl: "https://docs.doki.engine/templates/operators",
    },
    [CliErrorCode.MISSING_OPERATOR]: {
        code: CliErrorCode.MISSING_OPERATOR,
        suggestions: [
            { type: "fix", message: "在表达式之间添加运算符" },
            { type: "fix", message: "检查表达式语法" },
        ],
        documentationUrl: "https://docs.doki.engine/templates/operators",
    },
    [CliErrorCode.INVALID_TYPE]: {
        code: CliErrorCode.INVALID_TYPE,
        suggestions: [
            { type: "fix", message: "检查值的类型是否正确" },
            { type: "fix", message: "使用类型转换函数" },
        ],
        documentationUrl: "https://docs.doki.engine/templates/types",
    },
    [CliErrorCode.CIRCULAR_REFERENCE]: {
        code: CliErrorCode.CIRCULAR_REFERENCE,
        suggestions: [
            { type: "fix", message: "检查模板继承链" },
            { type: "fix", message: "移除循环引用" },
        ],
        documentationUrl: "https://docs.doki.engine/templates/inheritance",
    },

    // E2xx - CLI/配置错误
    [CliErrorCode.CONFIG_NOT_FOUND]: {
        code: CliErrorCode.CONFIG_NOT_FOUND,
        suggestions: [
            { type: "command", message: "初始化新项目", command: "doki init" },
            { type: "fix", message: "检查是否在正确的目录运行命令" },
            { type: "fix", message: "确保配置文件名为 doki.toml" },
            { type: "fix", message: "使用 -c 参数指定配置文件路径" },
        ],
        documentationUrl: "https://docs.doki.engine/config",
    },
    [CliErrorCode.CONFIG_PARSE_ERROR]: {
        code: CliErrorCode.CONFIG_PARSE_ERROR,
        suggestions: [
            { type: "fix", message: "检查配置文件格式是否正确" },
            { type: "fix", message: "确保 TOML 语法有效" },
            { type: "fix", message: "检查是否有拼写错误" },
            {
                type: "reference",
                message: "配置文件文档",
                url: "https://docs.doki.engine/config",
            },
        ],
        documentationUrl: "https://docs.doki.engine/config",
    },
    [CliErrorCode.CONFIG_VALIDATION_ERROR]: {
        code: CliErrorCode.CONFIG_VALIDATION_ERROR,
        suggestions: [
            { type: "fix", message: "检查配置项值是否有效" },
            { type: "fix", message: "确保必填项已设置" },
            {
                type: "reference",
                message: "配置项参考",
                url: "https://docs.doki.engine/config",
            },
        ],
        documentationUrl: "https://docs.doki.engine/config",
    },
    [CliErrorCode.INVALID_COMMAND_OPTION]: {
        code: CliErrorCode.INVALID_COMMAND_OPTION,
        suggestions: [
            {
                type: "command",
                message: "查看帮助信息",
                command: "doki --help",
            },
            { type: "fix", message: "检查选项名称是否正确" },
            { type: "fix", message: "确保选项值格式正确" },
        ],
        documentationUrl: "https://docs.doki.engine/cli",
    },
    [CliErrorCode.MISSING_ARGUMENT]: {
        code: CliErrorCode.MISSING_ARGUMENT,
        suggestions: [
            { type: "fix", message: "提供必要的参数" },
            {
                type: "command",
                message: "查看命令用法",
                command: "doki --help",
            },
        ],
        documentationUrl: "https://docs.doki.engine/cli",
    },
    [CliErrorCode.UNKNOWN_COMMAND]: {
        code: CliErrorCode.UNKNOWN_COMMAND,
        suggestions: [
            {
                type: "command",
                message: "查看可用命令",
                command: "doki --help",
            },
            { type: "fix", message: "检查命令拼写是否正确" },
        ],
        documentationUrl: "https://docs.doki.engine/cli",
    },

    // E3xx - IO/系统错误
    [CliErrorCode.FILE_NOT_FOUND]: {
        code: CliErrorCode.FILE_NOT_FOUND,
        suggestions: [
            { type: "fix", message: "检查文件路径是否正确" },
            { type: "fix", message: "确保文件存在" },
            { type: "fix", message: "检查文件名大小写" },
        ],
        documentationUrl: "https://docs.doki.engine/troubleshooting",
    },
    [CliErrorCode.FILE_READ_ERROR]: {
        code: CliErrorCode.FILE_READ_ERROR,
        suggestions: [
            { type: "fix", message: "检查文件权限" },
            { type: "fix", message: "确保文件未被其他程序占用" },
            { type: "fix", message: "检查文件编码是否为 UTF-8" },
        ],
        documentationUrl: "https://docs.doki.engine/troubleshooting",
    },
    [CliErrorCode.FILE_WRITE_ERROR]: {
        code: CliErrorCode.FILE_WRITE_ERROR,
        suggestions: [
            { type: "fix", message: "检查输出目录权限" },
            { type: "fix", message: "确保磁盘空间充足" },
            { type: "fix", message: "检查是否有其他进程占用目录" },
        ],
        documentationUrl: "https://docs.doki.engine/troubleshooting",
    },
    [CliErrorCode.DIRECTORY_ERROR]: {
        code: CliErrorCode.DIRECTORY_ERROR,
        suggestions: [
            { type: "fix", message: "检查目录路径是否正确" },
            { type: "fix", message: "确保有创建目录的权限" },
            { type: "fix", message: "检查父目录是否存在" },
        ],
        documentationUrl: "https://docs.doki.engine/troubleshooting",
    },
    [CliErrorCode.PERMISSION_DENIED]: {
        code: CliErrorCode.PERMISSION_DENIED,
        suggestions: [
            { type: "fix", message: "以管理员权限运行命令" },
            { type: "fix", message: "检查文件/目录权限" },
            { type: "fix", message: "确保有读写权限" },
        ],
        documentationUrl: "https://docs.doki.engine/troubleshooting",
    },
    [CliErrorCode.STATIC_COPY_ERROR]: {
        code: CliErrorCode.STATIC_COPY_ERROR,
        suggestions: [
            { type: "fix", message: "检查静态文件目录权限" },
            { type: "fix", message: "确保目标目录可写" },
            { type: "fix", message: "检查磁盘空间" },
        ],
        documentationUrl: "https://docs.doki.engine/troubleshooting",
    },

    // E4xx - 内容处理错误
    [CliErrorCode.CONTENT_PARSE_ERROR]: {
        code: CliErrorCode.CONTENT_PARSE_ERROR,
        suggestions: [
            { type: "fix", message: "检查文件格式是否正确" },
            { type: "fix", message: "确保 frontmatter 格式有效" },
            { type: "fix", message: "检查文件编码是否为 UTF-8" },
        ],
        documentationUrl: "https://docs.doki.engine/content",
    },
    [CliErrorCode.FRONTMATTER_ERROR]: {
        code: CliErrorCode.FRONTMATTER_ERROR,
        suggestions: [
            { type: "fix", message: "确保 frontmatter 使用 --- 分隔符" },
            { type: "fix", message: "检查 YAML 语法是否正确" },
            { type: "fix", message: "确保 frontmatter 在文件开头" },
            {
                type: "reference",
                message: "Frontmatter 文档",
                url: "https://docs.doki.engine/content/frontmatter",
            },
        ],
        documentationUrl: "https://docs.doki.engine/content/frontmatter",
    },
    [CliErrorCode.MARKDOWN_ERROR]: {
        code: CliErrorCode.MARKDOWN_ERROR,
        suggestions: [
            { type: "fix", message: "检查 Markdown 语法" },
            { type: "fix", message: "确保没有不匹配的标签" },
        ],
        documentationUrl: "https://docs.doki.engine/content/markdown",
    },
    [CliErrorCode.ENCODING_ERROR]: {
        code: CliErrorCode.ENCODING_ERROR,
        suggestions: [
            { type: "fix", message: "将文件保存为 UTF-8 编码" },
            { type: "fix", message: "检查文件是否有 BOM 标记" },
        ],
        documentationUrl: "https://docs.doki.engine/troubleshooting",
    },

    // E5xx - 构建错误
    [CliErrorCode.BUILD_FAILED]: {
        code: CliErrorCode.BUILD_FAILED,
        suggestions: [
            { type: "fix", message: "检查错误日志获取详细信息" },
            { type: "command", message: "运行检查命令", command: "doki check" },
        ],
        documentationUrl: "https://docs.doki.engine/build",
    },
    [CliErrorCode.TEMPLATE_LOAD_ERROR]: {
        code: CliErrorCode.TEMPLATE_LOAD_ERROR,
        suggestions: [
            { type: "fix", message: "检查模板文件是否存在" },
            { type: "fix", message: "检查模板目录配置" },
            { type: "fix", message: "确保模板文件可读" },
        ],
        documentationUrl: "https://docs.doki.engine/templates",
    },
    [CliErrorCode.RENDER_ERROR]: {
        code: CliErrorCode.RENDER_ERROR,
        suggestions: [
            { type: "fix", message: "检查模板变量是否正确" },
            { type: "fix", message: "确保所有依赖的模板都已加载" },
            { type: "fix", message: "检查模板语法" },
        ],
        documentationUrl: "https://docs.doki.engine/templates",
    },
    [CliErrorCode.OUTPUT_ERROR]: {
        code: CliErrorCode.OUTPUT_ERROR,
        suggestions: [
            { type: "fix", message: "检查输出目录权限" },
            { type: "fix", message: "确保磁盘空间充足" },
        ],
        documentationUrl: "https://docs.doki.engine/build",
    },
    [CliErrorCode.TAXONOMY_ERROR]: {
        code: CliErrorCode.TAXONOMY_ERROR,
        suggestions: [
            { type: "fix", message: "检查分类法配置" },
            { type: "fix", message: "确保内容文件中的分类法字段正确" },
        ],
        documentationUrl: "https://docs.doki.engine/taxonomy",
    },

    // E6xx - 运行时/服务器错误
    [CliErrorCode.SERVER_START_ERROR]: {
        code: CliErrorCode.SERVER_START_ERROR,
        suggestions: [
            { type: "fix", message: "检查端口是否被占用" },
            { type: "fix", message: "确保有足够的系统资源" },
            { type: "fix", message: "检查防火墙设置" },
        ],
        documentationUrl: "https://docs.doki.engine/cli/dev",
    },
    [CliErrorCode.PORT_IN_USE]: {
        code: CliErrorCode.PORT_IN_USE,
        suggestions: [
            {
                type: "command",
                message: "使用其他端口",
                command: "doki dev -p 3001",
            },
            { type: "fix", message: "查找并关闭占用端口的进程" },
        ],
        documentationUrl: "https://docs.doki.engine/cli/dev",
    },
    [CliErrorCode.WATCH_ERROR]: {
        code: CliErrorCode.WATCH_ERROR,
        suggestions: [
            { type: "fix", message: "检查监视的目录是否存在" },
            { type: "fix", message: "确保有足够的文件句柄" },
            { type: "fix", message: "重启开发服务器" },
        ],
        documentationUrl: "https://docs.doki.engine/cli/dev",
    },
    [CliErrorCode.WEBSOCKET_ERROR]: {
        code: CliErrorCode.WEBSOCKET_ERROR,
        suggestions: [
            { type: "fix", message: "刷新浏览器页面" },
            { type: "fix", message: "重启开发服务器" },
        ],
        documentationUrl: "https://docs.doki.engine/cli/dev",
    },
    [CliErrorCode.BROWSER_OPEN_ERROR]: {
        code: CliErrorCode.BROWSER_OPEN_ERROR,
        suggestions: [
            { type: "fix", message: "手动打开浏览器访问显示的 URL" },
            { type: "fix", message: "检查默认浏览器设置" },
        ],
        documentationUrl: "https://docs.doki.engine/cli/dev",
    },
};

/**
 * 获取错误建议
 */
export function getSuggestions(code: CliErrorCode): ErrorSuggestion[] {
    return SUGGESTION_TEMPLATES[code]?.suggestions || [];
}

/**
 * 获取错误文档链接
 */
export function getDocumentationUrl(code: CliErrorCode): string | undefined {
    return SUGGESTION_TEMPLATES[code]?.documentationUrl;
}

/**
 * 获取完整的建议模板
 */
export function getSuggestionTemplate(
    code: CliErrorCode,
): SuggestionTemplate | undefined {
    return SUGGESTION_TEMPLATES[code];
}

/**
 * 添加自定义建议
 */
export function addCustomSuggestions(
    code: CliErrorCode,
    suggestions: ErrorSuggestion[],
): void {
    if (SUGGESTION_TEMPLATES[code]) {
        SUGGESTION_TEMPLATES[code].suggestions = [
            ...SUGGESTION_TEMPLATES[code].suggestions,
            ...suggestions,
        ];
    }
}

/**
 * 常见错误快速修复建议
 */
export const QUICK_FIXES = {
    /**
     * 配置文件不存在时的快速修复
     */
    configNotFound: [
        {
            type: "command" as const,
            message: "初始化新项目",
            command: "doki init",
        },
        {
            type: "command" as const,
            message: "检查当前目录",
            command: "ls -la",
        },
    ],

    /**
     * 模板语法错误时的快速修复
     */
    templateSyntax: [
        { type: "fix" as const, message: "检查模板标签是否正确闭合" },
        { type: "fix" as const, message: "确保使用了正确的定界符 {% %}" },
        { type: "fix" as const, message: "检查变量引用语法 {{ variable }}" },
    ],

    /**
     * 端口占用时的快速修复
     */
    portInUse: (port: number) => [
        {
            type: "command" as const,
            message: "使用其他端口",
            command: `doki dev -p ${port + 1}`,
        },
        {
            type: "command" as const,
            message: "查找占用进程",
            command: `netstat -ano | findstr :${port}`,
        },
    ],

    /**
     * 权限不足时的快速修复
     */
    permissionDenied: [
        { type: "fix" as const, message: "以管理员权限运行命令" },
        { type: "fix" as const, message: "检查文件/目录权限" },
    ],

    /**
     * 内容文件错误时的快速修复
     */
    contentError: [
        { type: "fix" as const, message: "检查 frontmatter 格式" },
        { type: "fix" as const, message: "确保使用 --- 分隔符" },
        { type: "fix" as const, message: "检查 YAML 语法" },
    ],
};

/**
 * 错误诊断工具
 */
export function diagnoseError(error: Error): {
    possibleCauses: string[];
    suggestedActions: ErrorSuggestion[];
} {
    const message = error.message.toLowerCase();
    const possibleCauses: string[] = [];
    const suggestedActions: ErrorSuggestion[] = [];

    if (message.includes("enoent") || message.includes("not found")) {
        possibleCauses.push("文件或目录不存在");
        suggestedActions.push(
            { type: "fix", message: "检查文件路径是否正确" },
            { type: "fix", message: "确保文件或目录存在" },
        );
    }

    if (message.includes("eacces") || message.includes("permission")) {
        possibleCauses.push("权限不足");
        suggestedActions.push(
            { type: "fix", message: "以管理员权限运行命令" },
            { type: "fix", message: "检查文件/目录权限" },
        );
    }

    if (message.includes("eaddrinuse") || message.includes("port")) {
        possibleCauses.push("端口已被占用");
        suggestedActions.push(
            {
                type: "command",
                message: "使用其他端口",
                command: "doki dev -p 3001",
            },
            { type: "fix", message: "查找并关闭占用端口的进程" },
        );
    }

    if (message.includes("parse") || message.includes("syntax")) {
        possibleCauses.push("语法错误");
        suggestedActions.push(
            { type: "fix", message: "检查文件语法是否正确" },
            { type: "fix", message: "确保格式符合规范" },
        );
    }

    if (message.includes("template")) {
        possibleCauses.push("模板错误");
        suggestedActions.push(
            { type: "fix", message: "检查模板语法" },
            { type: "fix", message: "确保模板文件存在" },
        );
    }

    return { possibleCauses, suggestedActions };
}
