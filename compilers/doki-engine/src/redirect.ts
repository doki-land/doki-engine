/** Doki Engine 重定向页面生成模块 */

/** 默认重定向模板 */
const DEFAULT_REDIRECT_TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>正在跳转...</title>
  <link rel="canonical" href="{{url}}">
  <meta http-equiv="refresh" content="0; url={{url}}">
  <script>
    window.location.href = "{{url}}";
  </script>
</head>
<body>
  <p>正在跳转到 <a href="{{url}}">{{url}}</a></p>
</body>
</html>`;

/**
 * 生成重定向页面 HTML
 *
 * 使用 meta refresh 和 JavaScript 双重跳转确保兼容性。
 *
 * @param url 目标 URL
 * @param template 自定义模板（可选），使用 {{url}} 作为占位符
 * @returns 重定向页面 HTML
 */
export function generateRedirectPage(url: string, template?: string): string {
    const templateContent = template || DEFAULT_REDIRECT_TEMPLATE;
    return templateContent.replace(/\{\{url\}\}/g, url);
}

/**
 * 获取默认重定向模板
 *
 * @returns 默认模板字符串
 */
export function getDefaultRedirectTemplate(): string {
    return DEFAULT_REDIRECT_TEMPLATE;
}

/**
 * 规范化别名路径
 *
 * 确保路径以斜杠开头。
 *
 * @param alias 原始别名路径
 * @returns 规范化后的路径
 */
export function normalizeAlias(alias: string): string {
    if (alias.startsWith("/")) {
        return alias;
    }
    return `/${alias}`;
}

/**
 * 别名信息
 */
export interface AliasInfo {
    /** 别名路径 */
    alias: string;
    /** 目标 URL */
    targetUrl: string;
}

/**
 * 从内容中提取别名列表
 *
 * @param contentUrl 内容 URL
 * @param aliases 别名数组
 * @returns 别名信息数组
 */
export function extractAliases(
    contentUrl: string,
    aliases?: string[],
): AliasInfo[] {
    if (!aliases || aliases.length === 0) {
        return [];
    }

    return aliases.map((alias) => ({
        alias: normalizeAlias(alias),
        targetUrl: contentUrl,
    }));
}
