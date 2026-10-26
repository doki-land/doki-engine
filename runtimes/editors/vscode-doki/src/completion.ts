import * as vscode from "vscode";

/**
 * 标签补全项接口
 */
interface TagCompletion {
    /**
     * 标签名称
     */
    label: string;

    /**
     * 代码片段
     */
    snippet: string;

    /**
     * 文档说明
     */
    doc: string;
}

/**
 * 变量补全项接口
 */
interface VariableCompletion {
    /**
     * 变量名称
     */
    label: string;

    /**
     * 文档说明
     */
    doc: string;
}

/**
 * 过滤器补全项接口
 */
interface FilterCompletion {
    /**
     * 过滤器名称
     */
    label: string;

    /**
     * 代码片段（可选）
     */
    snippet?: string;

    /**
     * 文档说明
     */
    doc: string;
}

/**
 * 标签补全列表
 */
const TAGS: TagCompletion[] = [
    {
        label: "if",
        snippet: "if ${1:condition}\n  $2\nend if",
        doc: "条件判断",
    },
    { label: "else", snippet: "else\n  $1", doc: "否则分支" },
    {
        label: "else if",
        snippet: "else if ${1:condition}\n  $2",
        doc: "否则如果",
    },
    {
        label: "loop",
        snippet: "loop ${1:item} in ${2:list}\n  $3\nend loop",
        doc: "循环遍历",
    },
    {
        label: "loop-index",
        snippet: "loop (${1:index}, ${2:item}) in ${3:list}\n  $4\nend loop",
        doc: "带索引循环",
    },
    {
        label: "loop-range",
        snippet: "loop ${1:i} in ${2:0}..${3:10}\n  $4\nend loop",
        doc: "范围循环",
    },
    {
        label: "block",
        snippet: "block ${1:name}\n  $2\nend block",
        doc: "定义块",
    },
    { label: "extends", snippet: 'extends "${1:base.html}"', doc: "继承模板" },
    { label: "let", snippet: "let ${1:name} = ${2:value}", doc: "变量声明" },
    {
        label: "micro",
        snippet: "micro ${1:name}(${2:params})\n  $3\nend micro",
        doc: "微函数",
    },
    {
        label: "match",
        snippet: "match ${1:value}\n  case ${2:pattern}\n    $3\nend match",
        doc: "模式匹配",
    },
    { label: "case", snippet: "case ${1:pattern}", doc: "匹配分支" },
    {
        label: "include",
        snippet: 'include "${1:partial.html}"',
        doc: "包含模板",
    },
    { label: "using", snippet: "using ${1:module}", doc: "导入模块" },
    { label: "namespace", snippet: "namespace ${1:name};", doc: "命名空间" },
];

/**
 * 变量补全列表
 */
const VARIABLES: VariableCompletion[] = [
    { label: "site", doc: "站点配置对象" },
    { label: "site.title", doc: "站点标题" },
    { label: "site.description", doc: "站点描述" },
    { label: "site.author", doc: "站点作者" },
    { label: "site.url", doc: "站点 URL" },
    { label: "page", doc: "当前页面对象" },
    { label: "page.title", doc: "页面标题" },
    { label: "page.date", doc: "页面日期" },
    { label: "page.url", doc: "页面 URL" },
    { label: "page.content", doc: "页面内容" },
    { label: "data", doc: "数据文件对象" },
    { label: "content", doc: "块内容占位符" },
];

/**
 * 过滤器补全列表
 */
const FILTERS: FilterCompletion[] = [
    { label: "uppercase", doc: "转大写" },
    { label: "lowercase", doc: "转小写" },
    { label: "trim", doc: "去除首尾空白" },
    { label: "capitalize", doc: "首字母大写" },
    { label: "title", doc: "每个单词首字母大写" },
    { label: "slice", snippet: "slice(${1:start}, ${2:end})", doc: "切片" },
    {
        label: "replace",
        snippet: 'replace("${1:old}", "${2:new}")',
        doc: "替换",
    },
    { label: "split", snippet: 'split("${1:separator}")', doc: "分割" },
    { label: "join", snippet: 'join("${1:separator}")', doc: "连接" },
    { label: "length", doc: "获取长度" },
    { label: "first", doc: "获取第一个元素" },
    { label: "last", doc: "获取最后一个元素" },
    { label: "sort", doc: "排序" },
    { label: "reverse", doc: "反转" },
    { label: "default", snippet: "default(${1:value})", doc: "默认值" },
    { label: "round", doc: "四舍五入" },
    { label: "floor", doc: "向下取整" },
    { label: "ceil", doc: "向上取整" },
    { label: "abs", doc: "绝对值" },
];

/**
 * 创建带参数的签名信息
 * @param label 标签
 * @param documentation 文档
 * @param parameters 参数列表
 * @returns 签名信息
 */
function createSignature(
    label: string,
    documentation: string,
    parameters: vscode.ParameterInformation[],
): vscode.SignatureInformation {
    const signature = new vscode.SignatureInformation(label, documentation);
    signature.parameters = parameters;
    return signature;
}

/**
 * 标签参数签名信息
 */
const TAG_SIGNATURES: Record<string, vscode.SignatureInformation> = {
    if: createSignature("if condition", "条件判断语句", [
        new vscode.ParameterInformation("condition", "条件表达式"),
    ]),
    loop: createSignature("loop item in list", "循环遍历列表", [
        new vscode.ParameterInformation("item", "循环变量名"),
        new vscode.ParameterInformation("list", "要遍历的列表"),
    ]),
    "loop-index": createSignature(
        "loop (index, item) in list",
        "带索引的循环遍历",
        [
            new vscode.ParameterInformation("index", "索引变量名"),
            new vscode.ParameterInformation("item", "循环变量名"),
            new vscode.ParameterInformation("list", "要遍历的列表"),
        ],
    ),
    "loop-range": createSignature("loop i in start..end", "范围循环", [
        new vscode.ParameterInformation("i", "循环变量名"),
        new vscode.ParameterInformation("start", "起始值"),
        new vscode.ParameterInformation("end", "结束值"),
    ]),
    block: createSignature("block name", "定义可重写块", [
        new vscode.ParameterInformation("name", "块名称"),
    ]),
    extends: createSignature('extends "template"', "继承父模板", [
        new vscode.ParameterInformation("template", "父模板路径"),
    ]),
    let: createSignature("let name = value", "声明变量", [
        new vscode.ParameterInformation("name", "变量名"),
        new vscode.ParameterInformation("value", "变量值"),
    ]),
    micro: createSignature("micro name(params)", "定义微函数", [
        new vscode.ParameterInformation("name", "函数名"),
        new vscode.ParameterInformation("params", "参数列表"),
    ]),
    match: createSignature("match value", "模式匹配", [
        new vscode.ParameterInformation("value", "要匹配的值"),
    ]),
    case: createSignature("case pattern", "匹配分支", [
        new vscode.ParameterInformation("pattern", "匹配模式"),
    ]),
    include: createSignature('include "template"', "包含其他模板", [
        new vscode.ParameterInformation("template", "模板路径"),
    ]),
    using: createSignature("using module", "导入模块", [
        new vscode.ParameterInformation("module", "模块名"),
    ]),
    namespace: createSignature("namespace name;", "命名空间", [
        new vscode.ParameterInformation("name", "命名空间名称"),
    ]),
};

/**
 * 过滤器参数签名信息
 */
const FILTER_SIGNATURES: Record<string, vscode.SignatureInformation> = {
    slice: createSignature("slice(start, end)", "切片操作", [
        new vscode.ParameterInformation("start", "起始索引"),
        new vscode.ParameterInformation("end", "结束索引"),
    ]),
    replace: createSignature("replace(old, new)", "替换字符串", [
        new vscode.ParameterInformation("old", "要替换的字符串"),
        new vscode.ParameterInformation("new", "替换后的字符串"),
    ]),
    split: createSignature("split(separator)", "分割字符串", [
        new vscode.ParameterInformation("separator", "分隔符"),
    ]),
    join: createSignature("join(separator)", "连接数组元素", [
        new vscode.ParameterInformation("separator", "连接符"),
    ]),
    default: createSignature("default(value)", "设置默认值", [
        new vscode.ParameterInformation("value", "默认值"),
    ]),
};

/**
 * Doki 模板补全提供器
 */
export class DokiCompletionProvider implements vscode.CompletionItemProvider {
    /**
     * 提供补全项
     * @param document 文档对象
     * @param position 光标位置
     * @param token 取消令牌
     * @param context 补全上下文
     * @returns 补全项列表
     */
    public provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext,
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        if (this.isInCodeBlock(textBeforeCursor)) {
            return this.provideCodeBlockCompletions(textBeforeCursor);
        }

        if (this.isInOutputBlock(textBeforeCursor)) {
            return this.provideOutputBlockCompletions(textBeforeCursor);
        }

        return undefined;
    }

    /**
     * 判断是否在代码块中
     * @param text 光标前的文本
     * @returns 是否在代码块中
     */
    private isInCodeBlock(text: string): boolean {
        return /<%\s*$/.test(text) || /<%\s+\w*\s*$/.test(text);
    }

    /**
     * 判断是否在输出块中
     * @param text 光标前的文本
     * @returns 是否在输出块中
     */
    private isInOutputBlock(text: string): boolean {
        return /<%=\s*$/.test(text) || /<%=\s+.*\s*\|\s*$/.test(text);
    }

    /**
     * 提供代码块补全
     * @param text 光标前的文本
     * @returns 补全项列表
     */
    private provideCodeBlockCompletions(
        text: string,
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        if (/<%\s*$/.test(text)) {
            return this.createTagCompletions();
        }

        const tagMatch = text.match(/<%\s+(\w+)\s+$/);
        if (tagMatch) {
            const tagName = tagMatch[1];
            if (this.isConditionTag(tagName)) {
                return this.createVariableCompletions();
            }
        }

        return undefined;
    }

    /**
     * 判断是否为条件标签
     * @param tagName 标签名
     * @returns 是否为条件标签
     */
    private isConditionTag(tagName: string): boolean {
        return ["if", "else", "elseif", "else if"].includes(
            tagName.toLowerCase(),
        );
    }

    /**
     * 提供输出块补全
     * @param text 光标前的文本
     * @returns 补全项列表
     */
    private provideOutputBlockCompletions(
        text: string,
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        if (/<%=\s*$/.test(text)) {
            return this.createVariableCompletions();
        }

        if (/\|\s*$/.test(text)) {
            return this.createFilterCompletions();
        }

        return undefined;
    }

    /**
     * 创建标签补全项
     * @returns 补全项列表
     */
    private createTagCompletions(): vscode.CompletionItem[] {
        return TAGS.map((tag) => {
            const item = new vscode.CompletionItem(
                tag.label,
                vscode.CompletionItemKind.Keyword,
            );
            item.insertText = new vscode.SnippetString(tag.snippet);
            item.documentation = new vscode.MarkdownString(tag.doc);
            item.detail = "Doki 标签";
            item.sortText = `0_${tag.label}`;
            return item;
        });
    }

    /**
     * 创建变量补全项
     * @returns 补全项列表
     */
    private createVariableCompletions(): vscode.CompletionItem[] {
        return VARIABLES.map((variable) => {
            const item = new vscode.CompletionItem(
                variable.label,
                vscode.CompletionItemKind.Variable,
            );
            item.documentation = new vscode.MarkdownString(variable.doc);
            item.detail = "Doki 变量";
            item.sortText = `1_${variable.label}`;
            return item;
        });
    }

    /**
     * 创建过滤器补全项
     * @returns 补全项列表
     */
    private createFilterCompletions(): vscode.CompletionItem[] {
        return FILTERS.map((filter) => {
            const item = new vscode.CompletionItem(
                filter.label,
                vscode.CompletionItemKind.Function,
            );
            if (filter.snippet) {
                item.insertText = new vscode.SnippetString(filter.snippet);
            }
            item.documentation = new vscode.MarkdownString(filter.doc);
            item.detail = "Doki 过滤器";
            item.sortText = `2_${filter.label}`;
            return item;
        });
    }
}

/**
 * Doki 参数签名提示提供器
 */
export class DokiSignatureHelpProvider implements vscode.SignatureHelpProvider {
    /**
     * 提供签名帮助
     * @param document 文档对象
     * @param position 光标位置
     * @param token 取消令牌
     * @param context 签名上下文
     * @returns 签名帮助信息
     */
    public provideSignatureHelp(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.SignatureHelpContext,
    ): vscode.ProviderResult<vscode.SignatureHelp> {
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        const codeBlockSignature =
            this.tryGetCodeBlockSignature(textBeforeCursor);
        if (codeBlockSignature) {
            return codeBlockSignature;
        }

        const outputBlockSignature =
            this.tryGetOutputBlockSignature(textBeforeCursor);
        if (outputBlockSignature) {
            return outputBlockSignature;
        }

        return undefined;
    }

    /**
     * 尝试获取代码块签名
     * @param text 光标前的文本
     * @returns 签名帮助信息或 undefined
     */
    private tryGetCodeBlockSignature(
        text: string,
    ): vscode.SignatureHelp | undefined {
        const tagMatch = text.match(/<%\s+(\w+)\s+/);
        if (!tagMatch) {
            return undefined;
        }

        const tagName = tagMatch[1].toLowerCase();
        const signature = TAG_SIGNATURES[tagName];
        if (!signature) {
            return undefined;
        }

        const help = new vscode.SignatureHelp();
        help.signatures = [signature];
        help.activeSignature = 0;
        help.activeParameter = this.calculateActiveParameter(text, tagName);
        return help;
    }

    /**
     * 尝试获取输出块签名
     * @param text 光标前的文本
     * @returns 签名帮助信息或 undefined
     */
    private tryGetOutputBlockSignature(
        text: string,
    ): vscode.SignatureHelp | undefined {
        const filterMatch = text.match(/\|\s*(\w+)\s*\(?/);
        if (!filterMatch) {
            return undefined;
        }

        const filterName = filterMatch[1].toLowerCase();
        const signature = FILTER_SIGNATURES[filterName];
        if (!signature) {
            return undefined;
        }

        const help = new vscode.SignatureHelp();
        help.signatures = [signature];
        help.activeSignature = 0;
        help.activeParameter = this.calculateFilterActiveParameter(
            text,
            filterName,
        );
        return help;
    }

    /**
     * 计算当前活动参数索引
     * @param text 光标前的文本
     * @param tagName 标签名
     * @returns 参数索引
     */
    private calculateActiveParameter(text: string, tagName: string): number {
        const afterTag = text.replace(/^.*<%\s+\w+\s+/, "");
        const parts = afterTag.split(/\s+/).filter((p) => p.length > 0);

        if (tagName === "loop") {
            if (text.includes(" in ")) {
                return parts.includes("in") ? 1 : 0;
            }
            return Math.min(parts.length, 1);
        }

        if (tagName === "loop-index" || tagName === "loop-range") {
            return Math.min(parts.length, 2);
        }

        return Math.min(parts.length, 1);
    }

    /**
     * 计算过滤器当前活动参数索引
     * @param text 光标前的文本
     * @param filterName 过滤器名
     * @returns 参数索引
     */
    private calculateFilterActiveParameter(
        text: string,
        filterName: string,
    ): number {
        const filterStart = text.lastIndexOf(`| ${filterName}`);
        if (filterStart === -1) {
            return 0;
        }

        const afterFilter = text.substring(filterStart + filterName.length + 2);
        const openParen = afterFilter.indexOf("(");

        if (openParen === -1) {
            return 0;
        }

        const params = afterFilter.substring(openParen + 1);
        const commaCount = (params.match(/,/g) || []).length;
        return commaCount;
    }
}
