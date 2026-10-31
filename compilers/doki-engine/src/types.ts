/**
 * Doki Engine 基础类型定义
 *
 * 定义了 Doki Engine 使用的基本数据类型，包括值类型、对象类型、URL 类型和文本范围类型。
 */

/**
 * 值类型
 *
 * 表示 Doki 模板中可以使用的值类型。
 */
export type Value =
    | {
          type: "null";
      }
    | {
          type: "bool";
          value: boolean;
      }
    | {
          type: "integer";
          value: number;
      }
    | {
          type: "decimal";
          value: number;
      }
    | {
          type: "string";
          value: string;
      }
    | {
          type: "object";
          value: Object;
      };

/**
 * 对象类型
 *
 * 表示 Doki 模板中使用的对象类型，由键值对组成。
 */
export type Object = {
    [key: string]: Value;
};

/**
 * URL 类型
 *
 * 表示 Doki 模板中使用的 URL 类型。
 */
export type Url = string;

/**
 * 文本范围类型
 *
 * 表示源代码中的文本范围，包含起始和结束位置。
 */
export type TextRange = {
    start: number;
    end: number;
};

/**
 * 创建 null 值
 *
 * @returns null 值
 */
export function nullValue(): Value {
    return { type: "null" };
}

/**
 * 创建布尔值
 *
 * @param value 布尔值
 * @returns 布尔值类型的 Value
 */
export function boolValue(value: boolean): Value {
    return { type: "bool", value };
}

/**
 * 创建整数值
 *
 * @param value 整数值
 * @returns 整数类型的 Value
 */
export function integerValue(value: number): Value {
    return { type: "integer", value: Math.floor(value) };
}

/**
 * 创建小数值
 *
 * @param value 小数值
 * @returns 小数类型的 Value
 */
export function decimalValue(value: number): Value {
    return { type: "decimal", value };
}

/**
 * 创建字符串值
 *
 * @param value 字符串值
 * @returns 字符串类型的 Value
 */
export function stringValue(value: string): Value {
    return { type: "string", value };
}

/**
 * 创建空对象
 *
 * @returns 空对象类型的 Value
 */
export function emptyObject(): Value {
    return { type: "object", value: {} };
}

/**
 * 从键值对创建对象
 *
 * @param obj 键值对对象
 * @returns 对象类型的 Value
 */
export function objectFrom(obj: Object): Value {
    return { type: "object", value: obj };
}

/**
 * 创建文本范围
 *
 * @param start 起始位置
 * @param end 结束位置
 * @returns 文本范围
 */
export function textRange(start: number, end: number): TextRange {
    return { start, end };
}

/** Frontmatter 元数据 */
export interface Frontmatter {
    /** 页面标题 */
    title?: string;
    /** 发布日期 */
    date?: string;
    /** 页面描述 */
    description?: string;
    /** 布局模板名称 */
    layout?: string;
    /** 是否为草稿 */
    draft?: boolean;
    /** 标签列表 */
    tags?: string[];
    /** 分类名称 */
    category?: string;
    /** 系列名称 */
    series?: string;
    /** 系列中的顺序 */
    series_order?: number;
    /** 作者名称 */
    author?: string;
    /** 章节名称（文档用） */
    section?: string;
    /** 版本号（文档用） */
    version?: string;
    /** 语言标识（文档用） */
    language?: string;
    /** 更新日期 */
    updated?: string;
    /** 排序权重 */
    weight?: number;
    /** 特色图片 URL（用于 OG 标签） */
    image?: string;
    /** 内容语言 */
    lang?: string;
    /** 翻译键 */
    translationKey?: string;
    /** 自定义永久链接 */
    permalink?: string;
    /** 别名路径列表（用于重定向） */
    aliases?: string[];
    /** 其他自定义字段 */
    [key: string]: unknown;
}

/** 内容项 */
export interface Content {
    /** 源文件路径 */
    sourcePath: string;
    /** 相对路径（相对于内容目录） */
    relativePath: string;
    /** 输出 URL 路径 */
    url: string;
    /** Frontmatter 元数据 */
    frontmatter: Frontmatter;
    /** 原始 Markdown 内容 */
    rawContent: string;
    /** 渲染后的 HTML */
    html: string;
    /** 页面变量（用于模板） */
    variables: Record<string, unknown>;
    /** 语言代码 */
    lang: string;
    /** 内容基础名称（不含语言后缀） */
    baseName: string;
    /** 是否为默认语言 */
    isDefaultLang: boolean;
    /** 翻译关联（其他语言版本的路径） */
    translations?: Map<string, string>;
}
