/** Doki Engine 分类法系统模块 */

import { Content } from "./content.js";
import { TaxonomyConfig } from "./config.js";

/** 分类项 */
export interface TaxonomyTerm {
    /** 分类项名称 */
    name: string;
    /** URL 友好的标识符 */
    slug: string;
    /** 包含的内容数量 */
    count: number;
    /** 包含的内容列表 */
    pages: Content[];
}

/** 分类法 */
export interface Taxonomy {
    /** 分类法名称（如 tags、categories） */
    name: string;
    /** 所有分类项 */
    terms: TaxonomyTerm[];
    /** 分类法配置 */
    config: TaxonomyConfig;
}

/** 分类法集合 */
export interface TaxonomyCollection {
    /** 分类法映射 */
    taxonomies: Map<string, Taxonomy>;
    /**
     * 获取指定分类法中的分类项
     * @param name 分类法名称
     * @param term 分类项名称
     * @returns 分类项对象，不存在则返回 undefined
     */
    getTerm(name: string, term: string): TaxonomyTerm | undefined;
}

/** 分类页面 */
export interface TaxonomyPage {
    /** 分类法名称 */
    taxonomyName: string;
    /** 分类项名称 */
    termName: string;
    /** 分类项 slug */
    termSlug: string;
    /** 页面 URL */
    url: string;
    /** 包含的内容列表 */
    pages: Content[];
    /** 内容数量 */
    count: number;
}

/**
 * 将文本转换为 URL 友好的格式
 * 中文保持原样，空格替换为连字符，转小写
 * @param text 原始文本
 * @returns URL 友好的 slug
 */
export function slugify(text: string): string {
    return text
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\p{L}\p{N}\-]/gu, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

/**
 * 从内容集合中提取所有分类法数据
 * 支持单值（category、author）和多值（tags）字段
 * @param contents 内容集合
 * @param config 分类法配置映射
 * @returns 分类法集合对象
 */
export function extractTaxonomies(
    contents: Content[],
    config: Record<string, TaxonomyConfig>,
): TaxonomyCollection {
    const taxonomies = new Map<string, Taxonomy>();

    for (const taxonomyName of Object.keys(config)) {
        const taxonomyConfig = config[taxonomyName];
        const termMap = new Map<string, TaxonomyTerm>();

        for (const content of contents) {
            const frontmatterValue = content.frontmatter[taxonomyName];

            if (frontmatterValue === undefined || frontmatterValue === null) {
                continue;
            }

            const values = normalizeTaxonomyValue(frontmatterValue);

            for (const value of values) {
                const trimmedValue = value.trim();
                if (trimmedValue === "") {
                    continue;
                }

                const slug = slugify(trimmedValue);

                if (!termMap.has(slug)) {
                    termMap.set(slug, {
                        name: trimmedValue,
                        slug,
                        count: 0,
                        pages: [],
                    });
                }

                const term = termMap.get(slug)!;
                term.pages.push(content);
                term.count++;
            }
        }

        const terms = Array.from(termMap.values()).sort((a, b) =>
            a.name.localeCompare(b.name, "zh-CN"),
        );

        taxonomies.set(taxonomyName, {
            name: taxonomyName,
            terms,
            config: taxonomyConfig,
        });
    }

    return {
        taxonomies,
        getTerm(name: string, term: string): TaxonomyTerm | undefined {
            const taxonomy = taxonomies.get(name);
            if (!taxonomy) {
                return undefined;
            }
            return taxonomy.terms.find(
                (t) => t.slug === term || t.name === term,
            );
        },
    };
}

/**
 * 规范化分类法值为数组
 * @param value 原始值（可能是字符串或数组）
 * @returns 字符串数组
 */
function normalizeTaxonomyValue(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((v) => String(v));
    }

    if (typeof value === "string") {
        return [value];
    }

    return [String(value)];
}

/**
 * 生成分类项的 URL
 * @param taxonomyName 分类法名称
 * @param term 分类项名称或 slug
 * @returns 分类项的 URL 路径
 */
export function getTaxonomyUrl(taxonomyName: string, term: string): string {
    const slug = slugify(term);
    return `/${taxonomyName}/${slug}/`;
}

/**
 * 为每个分类项生成页面数据
 * @param taxonomyCollection 分类法集合
 * @returns 分类页面数组
 */
export function buildTaxonomyPages(
    taxonomyCollection: TaxonomyCollection,
): TaxonomyPage[] {
    const pages: TaxonomyPage[] = [];

    for (const [taxonomyName, taxonomy] of taxonomyCollection.taxonomies) {
        for (const term of taxonomy.terms) {
            pages.push({
                taxonomyName,
                termName: term.name,
                termSlug: term.slug,
                url: getTaxonomyUrl(taxonomyName, term.slug),
                pages: term.pages,
                count: term.count,
            });
        }
    }

    return pages;
}
