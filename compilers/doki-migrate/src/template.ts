/**
 * Doki Engine 模板语法转换工具
 *
 * 提供各种模板引擎语法到 Doki 模板语法的转换功能。
 */

/**
 * Hugo Go Template 转换规则
 */
const HUGO_TEMPLATE_RULES: Array<{
    pattern: RegExp;
    replacement: string;
}> = [
    {
        pattern: /\{\{\s*\.Title\s*\}\}/g,
        replacement: "{% page.title %}",
    },
    {
        pattern: /\{\{\s*\.Content\s*\}\}/g,
        replacement: "{% content %}",
    },
    {
        pattern: /\{\{\s*\.Description\s*\}\}/g,
        replacement: "{% page.description %}",
    },
    {
        pattern: /\{\{\s*\.Date\s*\}\}/g,
        replacement: "{% page.date %}",
    },
    {
        pattern: /\{\{\s*\.Permalink\s*\}\}/g,
        replacement: "{% page.url %}",
    },
    {
        pattern: /\{\{\s*\.RelPermalink\s*\}\}/g,
        replacement: "{% page.url %}",
    },
    {
        pattern: /\{\{\s*\.Summary\s*\}\}/g,
        replacement: "{% page.summary %}",
    },
    {
        pattern: /\{\{\s*\.Params\.(\w+)\s*\}\}/g,
        replacement: "{% page.$1 %}",
    },
    {
        pattern: /\{\{\s*range\s+\.Pages\s*\}\}/g,
        replacement: "{% loop page in pages %}",
    },
    {
        pattern: /\{\{\s*range\s+\$(\w+)\s*\}\}/g,
        replacement: "{% loop item in $1 %}",
    },
    {
        pattern: /\{\{\s*range\s+\.(\w+)\s*\}\}/g,
        replacement: "{% loop item in $1 %}",
    },
    {
        pattern: /\{\{\s*end\s*\}\}/g,
        replacement: "{% endloop %}",
    },
    {
        pattern: /\{\{\s*if\s+\.(\w+)\s*\}\}/g,
        replacement: "{% if $1 %}",
    },
    {
        pattern: /\{\{\s*if\s+\$(\w+)\s*\}\}/g,
        replacement: "{% if $1 %}",
    },
    {
        pattern: /\{\{\s*else\s*\}\}/g,
        replacement: "{% else %}",
    },
    {
        pattern: /\{\{\s*partial\s+"([^"]+)"\s*\}\}/g,
        replacement: '{% include "$1" %}',
    },
    {
        pattern: /\{\{\s*partial\s+'([^']+)'\s*\}\}/g,
        replacement: "{% include '$1' %}",
    },
    {
        pattern: /\{\{\s*\.Site\.Title\s*\}\}/g,
        replacement: "{% site.title %}",
    },
    {
        pattern: /\{\{\s*\.Site\.BaseURL\s*\}\}/g,
        replacement: "{% site.url %}",
    },
    {
        pattern: /\{\{\s*\.Site\.Params\.(\w+)\s*\}\}/g,
        replacement: "{% site.$1 %}",
    },
];

/**
 * Hexo EJS/Nunjucks 转换规则
 */
const HEXO_TEMPLATE_RULES: Array<{
    pattern: RegExp;
    replacement: string;
}> = [
    {
        pattern: /<%=\s*page\.title\s*%>/g,
        replacement: "{% page.title %}",
    },
    {
        pattern: /<%=\s*page\.content\s*%>/g,
        replacement: "{% content %}",
    },
    {
        pattern: /<%=\s*page\.description\s*%>/g,
        replacement: "{% page.description %}",
    },
    {
        pattern: /<%=\s*page\.date\s*%>/g,
        replacement: "{% page.date %}",
    },
    {
        pattern: /<%=\s*page\.permalink\s*%>/g,
        replacement: "{% page.url %}",
    },
    {
        pattern: /<%=\s*config\.(\w+)\s*%>/g,
        replacement: "{% site.$1 %}",
    },
    {
        pattern: /<%=\s*site\.(\w+)\s*%>/g,
        replacement: "{% site.$1 %}",
    },
    {
        pattern: /<%=\s*(\w+)\s*%>/g,
        replacement: "{% $1 %}",
    },
    {
        pattern: /<%\s*if\s*\(([^)]+)\)\s*\{\s*%>/g,
        replacement: "{% if $1 %}",
    },
    {
        pattern: /<%\s*\}\s*else\s*\{\s*%>/g,
        replacement: "{% else %}",
    },
    {
        pattern: /<%\s*\}\s*%>/g,
        replacement: "{% endif %}",
    },
    {
        pattern: /<%\s*for\s*\((\w+)\s+of\s+(\w+)\)\s*\{\s*%>/g,
        replacement: "{% loop $1 in $2 %}",
    },
    {
        pattern: /<%\s*(\w+)\.forEach\((\w+)\s*=>\s*\{\s*%>/g,
        replacement: "{% loop $2 in $1 %}",
    },
    {
        pattern: /<%\s*\}\)\s*%>/g,
        replacement: "{% endloop %}",
    },
    {
        pattern: /<%\s*include\s+['"]([^'"]+)['"]\s*%>/g,
        replacement: '{% include "$1" %}',
    },
    {
        pattern: /\{\{\s*page\.title\s*\}\}/g,
        replacement: "{% page.title %}",
    },
    {
        pattern: /\{\{\s*page\.content\s*\}\}/g,
        replacement: "{% content %}",
    },
    {
        pattern: /\{\{\s*config\.(\w+)\s*\}\}/g,
        replacement: "{% site.$1 %}",
    },
];

/**
 * Jekyll Liquid 转换规则
 */
const JEKYLL_TEMPLATE_RULES: Array<{
    pattern: RegExp;
    replacement: string;
}> = [
    {
        pattern: /\{\{\s*page\.title\s*\}\}/g,
        replacement: "{% page.title %}",
    },
    {
        pattern: /\{\{\s*page\.content\s*\}\}/g,
        replacement: "{% content %}",
    },
    {
        pattern: /\{\{\s*page\.description\s*\}\}/g,
        replacement: "{% page.description %}",
    },
    {
        pattern: /\{\{\s*page\.date\s*\}\}/g,
        replacement: "{% page.date %}",
    },
    {
        pattern: /\{\{\s*page\.url\s*\}\}/g,
        replacement: "{% page.url %}",
    },
    {
        pattern: /\{\{\s*site\.title\s*\}\}/g,
        replacement: "{% site.title %}",
    },
    {
        pattern: /\{\{\s*site\.description\s*\}\}/g,
        replacement: "{% site.description %}",
    },
    {
        pattern: /\{\{\s*site\.url\s*\}\}/g,
        replacement: "{% site.url %}",
    },
    {
        pattern: /\{\{\s*site\.(\w+)\s*\}\}/g,
        replacement: "{% site.$1 %}",
    },
    {
        pattern: /\{\{\s*content\s*\}\}/g,
        replacement: "{% content %}",
    },
    {
        pattern: /\{%\s*for\s+(\w+)\s+in\s+site\.(\w+)\s*%\}/g,
        replacement: "{% loop $1 in site.$2 %}",
    },
    {
        pattern: /\{%\s*for\s+(\w+)\s+in\s+(\w+)\s*%\}/g,
        replacement: "{% loop $1 in $2 %}",
    },
    {
        pattern: /\{%\s*endfor\s*%\}/g,
        replacement: "{% endloop %}",
    },
    {
        pattern: /\{%\s*if\s+page\.(\w+)\s*%\}/g,
        replacement: "{% if page.$1 %}",
    },
    {
        pattern: /\{%\s*if\s+site\.(\w+)\s*%\}/g,
        replacement: "{% if site.$1 %}",
    },
    {
        pattern: /\{%\s*if\s+([^%]+)\s*%\}/g,
        replacement: "{% if $1 %}",
    },
    {
        pattern: /\{%\s*else\s*%\}/g,
        replacement: "{% else %}",
    },
    {
        pattern: /\{%\s*endif\s*%\}/g,
        replacement: "{% endif %}",
    },
    {
        pattern: /\{%\s*include\s+([^%\s]+)\s*%\}/g,
        replacement: '{% include "$1" %}',
    },
    {
        pattern: /\{\{\s*page\.(\w+)\s*\}\}/g,
        replacement: "{% page.$1 %}",
    },
];

/**
 * 转换 Hugo Go Template 语法到 Doki 语法
 *
 * @param content 包含 Hugo 模板语法的内容
 * @returns 转换后的内容
 */
export function convertHugoTemplate(content: string): string {
    let result = content;

    for (const rule of HUGO_TEMPLATE_RULES) {
        result = result.replace(rule.pattern, rule.replacement);
    }

    return result;
}

/**
 * 转换 Hexo EJS/Nunjucks 语法到 Doki 语法
 *
 * @param content 包含 Hexo 模板语法的内容
 * @returns 转换后的内容
 */
export function convertHexoTemplate(content: string): string {
    let result = content;

    for (const rule of HEXO_TEMPLATE_RULES) {
        result = result.replace(rule.pattern, rule.replacement);
    }

    return result;
}

/**
 * 转换 Jekyll Liquid 语法到 Doki 语法
 *
 * @param content 包含 Jekyll Liquid 语法的模板内容
 * @returns 转换后的内容
 */
export function convertJekyllTemplate(content: string): string {
    let result = content;

    for (const rule of JEKYLL_TEMPLATE_RULES) {
        result = result.replace(rule.pattern, rule.replacement);
    }

    return result;
}

/**
 * 模板引擎类型
 */
export type TemplateEngine = "hugo" | "hexo" | "jekyll";

/**
 * 根据引擎类型转换模板语法
 *
 * @param content 模板内容
 * @param engine 模板引擎类型
 * @returns 转换后的内容
 */
export function convertTemplate(
    content: string,
    engine: TemplateEngine,
): string {
    switch (engine) {
        case "hugo":
            return convertHugoTemplate(content);
        case "hexo":
            return convertHexoTemplate(content);
        case "jekyll":
            return convertJekyllTemplate(content);
        default:
            return content;
    }
}
