/**
 * Doki Engine Frontmatter 转换工具
 *
 * 提供各种 frontmatter 格式之间的转换功能。
 */

import * as TOML from "smol-toml";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/**
 * Frontmatter 格式类型
 */
export type FrontmatterFormat = "toml" | "yaml" | "json";

/**
 * 解析后的 Frontmatter 数据
 */
export interface ParsedFrontmatter {
    data: Record<string, unknown>;
    content: string;
}

/**
 * 解析 YAML 格式的 frontmatter
 *
 * @param content 包含 YAML frontmatter 的内容
 * @returns 解析后的数据和内容
 */
export function parseYamlFrontmatter(content: string): ParsedFrontmatter {
    const lines = content.trimStart().split(/\r?\n/);

    if (lines[0]?.trim() !== "---") {
        return {
            data: {},
            content: content.trim(),
        };
    }

    const closeIndex = lines.findIndex(
        (line, index) => index > 0 && line.trim() === "---",
    );

    if (closeIndex === -1) {
        return {
            data: {},
            content: content.trim(),
        };
    }

    const parsed = parseYaml(lines.slice(1, closeIndex).join("\n"));
    return {
        data:
            parsed && typeof parsed === "object"
                ? (parsed as Record<string, unknown>)
                : {},
        content: lines
            .slice(closeIndex + 1)
            .join("\n")
            .trim(),
    };
}

/**
 * 解析 TOML 格式的 frontmatter
 *
 * @param content 包含 TOML frontmatter 的内容（+++ 包围）
 * @returns 解析后的数据和内容
 */
export function parseTomlFrontmatter(content: string): ParsedFrontmatter {
    const tomlMatch = content.match(
        /^\+{3}\r?\n([\s\S]*?)\r?\n\+{3}\r?\n?([\s\S]*)$/,
    );

    if (!tomlMatch) {
        return {
            data: {},
            content: content.trim(),
        };
    }

    try {
        const data = TOML.parse(tomlMatch[1]) as Record<string, unknown>;
        return {
            data,
            content: tomlMatch[2].trim(),
        };
    } catch {
        return {
            data: {},
            content: content.trim(),
        };
    }
}

/**
 * 解析 JSON 格式的 frontmatter
 *
 * @param content 包含 JSON frontmatter 的内容
 * @returns 解析后的数据和内容
 */
export function parseJsonFrontmatter(content: string): ParsedFrontmatter {
    const jsonMatch = content.match(/^\{[\s\S]*?\}\r?\n?([\s\S]*)$/);

    if (!jsonMatch) {
        return {
            data: {},
            content: content.trim(),
        };
    }

    try {
        const jsonEnd = content.indexOf("}\n");
        if (jsonEnd === -1) {
            return {
                data: {},
                content: content.trim(),
            };
        }

        const jsonStr = content.slice(0, jsonEnd + 1);
        const data = JSON.parse(jsonStr) as Record<string, unknown>;
        return {
            data,
            content: content.slice(jsonEnd + 1).trim(),
        };
    } catch {
        return {
            data: {},
            content: content.trim(),
        };
    }
}

/**
 * 自动检测并解析 frontmatter
 *
 * 支持 YAML（---）、TOML（+++）和 JSON 格式
 *
 * @param content 原始内容
 * @returns 解析后的数据和内容
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
    const trimmed = content.trim();

    if (trimmed.startsWith("+++")) {
        return parseTomlFrontmatter(trimmed);
    }

    if (trimmed.startsWith("---")) {
        return parseYamlFrontmatter(trimmed);
    }

    if (trimmed.startsWith("{")) {
        return parseJsonFrontmatter(trimmed);
    }

    return {
        data: {},
        content: trimmed,
    };
}

/**
 * 将数据序列化为 YAML frontmatter
 *
 * @param data 数据对象
 * @param content 正文内容
 * @returns 包含 YAML frontmatter 的完整内容
 */
export function toYamlFrontmatter(
    data: Record<string, unknown>,
    content: string,
): string {
    const yamlStr = stringifyYaml(data).trim();
    const block = yamlStr ? `---\n${yamlStr}\n---` : "---\n---";
    return `${block}\n\n${content}`;
}

/**
 * 将数据序列化为 TOML frontmatter
 *
 * @param data 数据对象
 * @param content 正文内容
 * @returns 包含 TOML frontmatter 的完整内容
 */
export function toTomlFrontmatter(
    data: Record<string, unknown>,
    content: string,
): string {
    const tomlStr = TOML.stringify(data);
    return `+++\n${tomlStr.trim()}\n+++\n\n${content}`;
}

/**
 * 将数据序列化为 JSON frontmatter
 *
 * @param data 数据对象
 * @param content 正文内容
 * @returns 包含 JSON frontmatter 的完整内容
 */
export function toJsonFrontmatter(
    data: Record<string, unknown>,
    content: string,
): string {
    const jsonStr = JSON.stringify(data, null, 2);
    return `${jsonStr}\n\n${content}`;
}

/**
 * 将 frontmatter 转换为指定格式
 *
 * @param data 数据对象
 * @param content 正文内容
 * @param format 目标格式
 * @returns 转换后的完整内容
 */
export function toFrontmatter(
    data: Record<string, unknown>,
    content: string,
    format: FrontmatterFormat,
): string {
    switch (format) {
        case "toml":
            return toTomlFrontmatter(data, content);
        case "json":
            return toJsonFrontmatter(data, content);
        default:
            return toYamlFrontmatter(data, content);
    }
}

/**
 * 转换 frontmatter 格式
 *
 * @param content 原始内容
 * @param targetFormat 目标格式
 * @returns 转换后的内容
 */
export function convertFrontmatter(
    content: string,
    targetFormat: FrontmatterFormat,
): string {
    const parsed = parseFrontmatter(content);
    return toFrontmatter(parsed.data, parsed.content, targetFormat);
}

/**
 * 检测内容的 frontmatter 格式
 *
 * @param content 原始内容
 * @returns 检测到的格式，如果没有 frontmatter 则返回 null
 */
export function detectFrontmatterFormat(
    content: string,
): FrontmatterFormat | null {
    const trimmed = content.trim();

    if (trimmed.startsWith("+++")) {
        return "toml";
    }

    if (trimmed.startsWith("---")) {
        return "yaml";
    }

    if (trimmed.startsWith("{") && trimmed.includes("}\n")) {
        return "json";
    }

    return null;
}

/**
 * 合并 frontmatter 数据
 *
 * @param existing 现有数据
 * @param updates 更新数据
 * @returns 合并后的数据
 */
export function mergeFrontmatter(
    existing: Record<string, unknown>,
    updates: Record<string, unknown>,
): Record<string, unknown> {
    return {
        ...existing,
        ...updates,
    };
}

/**
 * 标准化 frontmatter 字段名
 *
 * 将不同平台的字段名映射到 Doki 标准字段名
 *
 * @param data 原始数据
 * @returns 标准化后的数据
 */
export function normalizeFrontmatter(
    data: Record<string, unknown>,
): Record<string, unknown> {
    const normalized: Record<string, unknown> = {};
    const mappings: Record<string, string> = {
        permalink: "url",
        summary: "description",
        excerpt: "description",
        categories: "category",
        created: "date",
        published: "date",
        modified: "updated",
        lastmod: "updated",
        featured_image: "image",
        thumbnail: "image",
        cover: "image",
    };

    for (const [key, value] of Object.entries(data)) {
        const normalizedKey = mappings[key] || key;

        if (normalizedKey === "category" && Array.isArray(value)) {
            normalized[normalizedKey] = value[0];
        } else {
            normalized[normalizedKey] = value;
        }
    }

    return normalized;
}
