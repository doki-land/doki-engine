/** Doki Engine 内容原型系统 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseYamlFrontmatter } from "@doki-land/doki-migrate";

/** 内容原型配置 */
export interface Archetype {
    /** 内容类型 */
    type: string;
    /** 默认布局 */
    layout?: string;
    /** 默认路径模板 */
    pathTemplate?: string;
    /** Frontmatter 模板 */
    frontmatter?: Record<string, unknown>;
}

/** 创建内容选项 */
export interface CreateContentOptions {
    /** 内容类型 */
    type: string;
    /** 内容标题 */
    title: string;
    /** 布局模板 */
    layout?: string;
    /** 日期字符串 (YYYY-MM-DD) */
    date?: string;
    /** 是否为草稿 */
    draft?: boolean;
    /** 自定义路径 */
    customPath?: string;
    /** 原型配置 */
    archetype?: Archetype;
    /** 内容目录 */
    contentDir: string;
}

/** Frontmatter 生成选项 */
export interface GenerateFrontmatterOptions {
    /** 内容标题 */
    title: string;
    /** 日期字符串 (YYYY-MM-DD) */
    date: string;
    /** 是否为草稿 */
    draft: boolean;
    /** 布局模板 */
    layout: string;
    /** 原型配置 */
    archetype?: Archetype;
}

/** 内容创建结果 */
export interface CreateContentResult {
    /** 是否成功 */
    success: boolean;
    /** 创建的文件路径 */
    filePath?: string;
    /** 错误信息 */
    error?: string;
}

/** 内容原型管理器 */
export class ArchetypeManager {
    private archetypesDir: string;

    constructor(archetypesDir: string) {
        this.archetypesDir = archetypesDir;
    }

    /**
     * 获取指定类型的原型
     *
     * @param type 内容类型
     * @returns 原型配置，如果不存在则返回 null
     */
    async getArchetype(type: string): Promise<Archetype | null> {
        const archetypePath = join(this.archetypesDir, `${type}.md`);

        if (!existsSync(archetypePath)) {
            return null;
        }

        try {
            const content = await readFile(archetypePath, "utf-8");
            const { data } = parseYamlFrontmatter(content);

            return {
                type,
                layout: data.layout as string | undefined,
                pathTemplate: data.pathTemplate as string | undefined,
                frontmatter: data,
            };
        } catch {
            return null;
        }
    }

    /**
     * 创建内容文件
     *
     * @param options 创建选项
     * @returns 创建结果
     */
    async createContent(
        options: CreateContentOptions,
    ): Promise<CreateContentResult> {
        const { type, title, contentDir, customPath, archetype } = options;

        const date = options.date || formatDate(new Date());
        const slug = generateSlug(title);
        const draft = options.draft ?? false;
        const layout =
            options.layout || archetype?.layout || getDefaultLayout(type);

        let targetPath: string;
        if (customPath) {
            targetPath = join(contentDir, customPath);
        } else {
            targetPath = generateContentPath(contentDir, type, slug, date);
        }

        const targetDir = dirname(targetPath);
        if (!existsSync(targetDir)) {
            try {
                mkdirSync(targetDir, { recursive: true });
            } catch (error) {
                return {
                    success: false,
                    error: `无法创建目录 ${targetDir}: ${(error as Error).message}`,
                };
            }
        }

        if (existsSync(targetPath)) {
            return {
                success: false,
                error: `文件已存在: ${targetPath}`,
            };
        }

        const frontmatter = generateFrontmatter({
            title,
            layout,
            date,
            draft,
            archetype: archetype ?? undefined,
        });

        const fileContent = `${frontmatter}
---

`;

        try {
            writeFileSync(targetPath, fileContent, "utf-8");
            return {
                success: true,
                filePath: targetPath,
            };
        } catch (error) {
            return {
                success: false,
                error: `无法创建文件 ${targetPath}: ${(error as Error).message}`,
            };
        }
    }
}

/**
 * 生成 slug
 *
 * 将标题转换为 URL 友好的 slug
 *
 * @param title 标题
 * @returns slug 字符串
 */
export function generateSlug(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * 生成文件名
 *
 * @param title 标题
 * @param date 日期字符串 (可选)
 * @returns 文件名字符串
 */
export function generateFilename(title: string, date?: string): string {
    const slug = generateSlug(title);
    if (date) {
        return `${date}-${slug}.md`;
    }
    return `${slug}.md`;
}

/**
 * 生成 frontmatter 字符串
 *
 * @param options 创建选项
 * @returns YAML frontmatter 字符串
 */
export function generateFrontmatter(
    options: GenerateFrontmatterOptions,
): string {
    const { title, date, draft, layout, archetype } = options;

    const frontmatterData: Record<string, unknown> = {
        title,
        date,
        draft,
        layout,
        description: "",
    };

    if (archetype?.frontmatter) {
        for (const [key, value] of Object.entries(archetype.frontmatter)) {
            if (
                key !== "title" &&
                key !== "date" &&
                key !== "draft" &&
                key !== "layout"
            ) {
                frontmatterData[key] = value;
            }
        }
    }

    const lines: string[] = ["---"];

    for (const [key, value] of Object.entries(frontmatterData)) {
        if (value === undefined || value === null) {
            continue;
        }

        if (typeof value === "string") {
            if (
                value.includes("\n") ||
                value.includes(":") ||
                value.includes('"')
            ) {
                lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
            } else {
                lines.push(`${key}: "${value}"`);
            }
        } else if (typeof value === "boolean") {
            lines.push(`${key}: ${value}`);
        } else if (Array.isArray(value)) {
            if (value.length === 0) {
                lines.push(`${key}: []`);
            } else {
                lines.push(`${key}:`);
                for (const item of value) {
                    lines.push(`  - "${item}"`);
                }
            }
        } else if (typeof value === "object") {
            lines.push(`${key}: ${JSON.stringify(value)}`);
        } else {
            lines.push(`${key}: ${value}`);
        }
    }

    lines.push("---");

    return lines.join("\n");
}

/**
 * 格式化日期为 YYYY-MM-DD 格式
 *
 * @param date 日期对象
 * @returns 格式化后的日期字符串
 */
export function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * 获取默认布局
 *
 * @param type 内容类型
 * @returns 默认布局名称
 */
function getDefaultLayout(type: string): string {
    switch (type) {
        case "post":
            return "post";
        case "page":
            return "page";
        default:
            return "layout";
    }
}

/**
 * 生成内容文件路径
 *
 * @param contentDir 内容目录
 * @param type 内容类型
 * @param slug slug
 * @param date 日期字符串
 * @returns 完整文件路径
 */
function generateContentPath(
    contentDir: string,
    type: string,
    slug: string,
    date: string,
): string {
    switch (type) {
        case "post":
            return join(contentDir, "posts", `${date}-${slug}.md`);
        case "page":
            return join(contentDir, slug, "index.md");
        default:
            return join(contentDir, type, `${date}-${slug}.md`);
    }
}
