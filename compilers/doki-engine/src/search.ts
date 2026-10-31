/** Doki Engine 搜索索引模块 */

import type { SearchConfig } from "./config.js";
import type { Content } from "./types.js";

/** 搜索索引条目 */
export interface SearchIndexEntry {
    /** 页面 URL */
    url: string;
    /** 页面标题 */
    title: string;
    /** 页面内容（纯文本） */
    content: string;
    /** 页面描述 */
    description?: string;
    /** 标签 */
    tags?: string[];
    /** 分类 */
    category?: string;
    /** 发布日期 */
    date?: string;
    /** 自定义字段 */
    [key: string]: unknown;
}

/** 搜索索引 */
export interface SearchIndex {
    /** 索引版本 */
    version: string;
    /** 生成时间 */
    generated: string;
    /** 条目列表 */
    entries: SearchIndexEntry[];
}

/** 分词函数类型 */
export type SegmentFunction = (text: string) => string[];

/** jieba 分词器实例缓存 */
let jiebaSegmenter: SegmentFunction | null = null;

/** jieba 是否可用 */
let jiebaAvailable: boolean | null = null;

/**
 * 检查 jieba 是否可用
 * @returns jieba 是否可用
 */
function isJiebaAvailable(): boolean {
    if (jiebaAvailable !== null) {
        return jiebaAvailable;
    }

    try {
        require.resolve("nodejieba");
        jiebaAvailable = true;
        return true;
    } catch {
        jiebaAvailable = false;
        return false;
    }
}

/**
 * 获取 jieba 分词器
 * @returns jieba 分词函数，如果不可用则返回 null
 */
function getJiebaSegmenter(): SegmentFunction | null {
    if (jiebaSegmenter) {
        return jiebaSegmenter;
    }

    if (!isJiebaAvailable()) {
        return null;
    }

    try {
        const nodejieba = require("nodejieba");
        jiebaSegmenter = (text: string) => nodejieba.cut(text, true);
        return jiebaSegmenter;
    } catch {
        return null;
    }
}

/**
 * 简单分词（按空格和标点分割）
 * @param text 待分词文本
 * @returns 分词结果数组
 */
export function simpleSegment(text: string): string[] {
    const result: string[] = [];
    let current = "";

    for (const char of text) {
        if (isWordChar(char)) {
            current += char.toLowerCase();
        } else {
            if (current.length > 0) {
                result.push(current);
                current = "";
            }
            if (isCjkChar(char)) {
                result.push(char);
            }
        }
    }

    if (current.length > 0) {
        result.push(current);
    }

    return result;
}

/**
 * 判断字符是否为单词字符
 * @param char 字符
 * @returns 是否为单词字符
 */
function isWordChar(char: string): boolean {
    const code = char.charCodeAt(0);
    return (
        (code >= 0x61 && code <= 0x7a) ||
        (code >= 0x41 && code <= 0x5a) ||
        (code >= 0x30 && code <= 0x39)
    );
}

/**
 * 判断字符是否为 CJK 字符
 * @param char 字符
 * @returns 是否为 CJK 字符
 */
function isCjkChar(char: string): boolean {
    const code = char.charCodeAt(0);
    return (
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3400 && code <= 0x4dbf) ||
        (code >= 0x20000 && code <= 0x2a6df) ||
        (code >= 0x2a700 && code <= 0x2b73f) ||
        (code >= 0x2b740 && code <= 0x2b81f) ||
        (code >= 0x2b820 && code <= 0x2ceaf) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0x2f800 && code <= 0x2fa1f)
    );
}

/**
 * 创建分词器
 * @param type 分词类型，默认为 'none'
 * @returns 分词函数
 */
export function createSegmenter(
    type: "jieba" | "none" = "none",
): SegmentFunction {
    if (type === "jieba") {
        const jieba = getJiebaSegmenter();
        if (jieba) {
            return jieba;
        }
        console.warn("jieba not available, falling back to simple segmenter");
    }

    return simpleSegment;
}

/**
 * 提取纯文本
 * @param html HTML 内容
 * @returns 纯文本内容
 */
export function extractPlainText(html: string): string {
    let text = html;

    text = text.replace(
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        "",
    );
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
    text = text.replace(/<[^>]+>/g, " ");
    text = text.replace(/&nbsp;/g, " ");
    text = text.replace(/&amp;/g, "&");
    text = text.replace(/&lt;/g, "<");
    text = text.replace(/&gt;/g, ">");
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&\w+;/g, "");
    text = text.replace(/\s+/g, " ");
    text = text.trim();

    return text;
}

/** 搜索索引构建器 */
export class SearchIndexBuilder {
    private entries: SearchIndexEntry[];

    /**
     * 创建搜索索引构建器实例
     * @param _config 搜索配置
     */
    constructor(_config: SearchConfig) {
        this.entries = [];
    }

    /**
     * 添加条目
     * @param entry 搜索索引条目
     */
    addEntry(entry: SearchIndexEntry): void {
        this.entries.push(entry);
    }

    /**
     * 从内容添加条目
     * @param content 内容对象
     * @param fields 要索引的字段列表
     */
    addEntryFromContent(content: Content, fields: string[]): void {
        const entry: SearchIndexEntry = {
            url: content.url,
            title: content.frontmatter.title || "",
            content: "",
        };

        for (const field of fields) {
            switch (field) {
                case "title":
                    entry.title = content.frontmatter.title || "";
                    break;
                case "content":
                    entry.content = extractPlainText(content.html);
                    break;
                case "description": {
                    const desc =
                        content.frontmatter.description ||
                        content.frontmatter.summary ||
                        "";
                    entry.description =
                        typeof desc === "string" ? desc : String(desc);
                    break;
                }
                case "tags":
                    if (content.frontmatter.tags) {
                        entry.tags = Array.isArray(content.frontmatter.tags)
                            ? content.frontmatter.tags
                            : [content.frontmatter.tags];
                    }
                    break;
                case "category":
                    entry.category = content.frontmatter.category || "";
                    break;
                case "date":
                    entry.date = content.frontmatter.date || "";
                    break;
                default:
                    if (content.frontmatter[field] !== undefined) {
                        entry[field] = content.frontmatter[field];
                    }
            }
        }

        this.addEntry(entry);
    }

    /**
     * 构建索引
     * @returns 搜索索引对象
     */
    build(): SearchIndex {
        return {
            version: "1.0.0",
            generated: new Date().toISOString(),
            entries: [...this.entries],
        };
    }

    /**
     * 生成 JSON 字符串
     * @returns JSON 字符串
     */
    toJSON(): string {
        const index = this.build();
        return JSON.stringify(index, null, 2);
    }

    /**
     * 清空索引
     */
    clear(): void {
        this.entries = [];
    }

    /**
     * 获取条目数量
     * @returns 条目数量
     */
    get size(): number {
        return this.entries.length;
    }
}

/**
 * 生成搜索组件 JavaScript
 * @returns 搜索组件 JavaScript 代码
 */
export function generateSearchComponent(): string {
    return `/**
 * Doki Engine 搜索组件
 * 自动生成的搜索功能代码
 */
(function() {
  'use strict';

  let searchIndex = null;
  let searchInput = null;
  let searchResults = null;

  /**
   * 加载搜索索引
   */
  async function loadSearchIndex() {
    if (searchIndex) return searchIndex;
    
    try {
      const response = await fetch('/search-index.json');
      searchIndex = await response.json();
      return searchIndex;
    } catch (error) {
      console.error('Failed to load search index:', error);
      return null;
    }
  }

  /**
   * 简单分词
   */
  function tokenize(text) {
    return text.toLowerCase()
      .split(/[\\s\\p{P}\\p{S}]+/u)
      .filter(t => t.length > 0);
  }

  /**
   * 计算匹配分数
   */
  function calculateScore(entry, queryTokens) {
    let score = 0;
    const title = (entry.title || '').toLowerCase();
    const content = (entry.content || '').toLowerCase();
    const description = (entry.description || '').toLowerCase();

    for (const token of queryTokens) {
      if (title.includes(token)) {
        score += 10;
        if (title === token) score += 20;
      }
      if (description.includes(token)) {
        score += 5;
      }
      if (content.includes(token)) {
        score += 1;
      }
      if (entry.tags && entry.tags.some(t => t.toLowerCase().includes(token))) {
        score += 8;
      }
      if (entry.category && entry.category.toLowerCase().includes(token)) {
        score += 6;
      }
    }

    return score;
  }

  /**
   * 执行搜索
   */
  function search(query) {
    if (!searchIndex || !query.trim()) return [];
    
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const results = searchIndex.entries
      .map(entry => ({
        entry,
        score: calculateScore(entry, queryTokens)
      }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    return results;
  }

  /**
   * 渲染搜索结果
   */
  function renderResults(results) {
    if (!searchResults) return;
    
    if (results.length === 0) {
      searchResults.innerHTML = '<div class="search-no-results">未找到相关结果</div>';
      return;
    }

    const html = results.map(r => {
      const entry = r.entry;
      const snippet = entry.content 
        ? entry.content.substring(0, 150) + (entry.content.length > 150 ? '...' : '')
        : '';
      
      return \`
        <a href="\${entry.url}" class="search-result-item">
          <div class="search-result-title">\${entry.title}</div>
          \${entry.description ? \`<div class="search-result-description">\${entry.description}</div>\` : ''}
          \${snippet ? \`<div class="search-result-snippet">\${snippet}</div>\` : ''}
        </a>
      \`;
    }).join('');

    searchResults.innerHTML = html;
  }

  /**
   * 初始化搜索
   */
  async function init() {
    searchInput = document.querySelector('[data-search-input]');
    searchResults = document.querySelector('[data-search-results]');

    if (!searchInput) return;

    await loadSearchIndex();

    let debounceTimer;
    searchInput.addEventListener('input', function(e) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const results = search(e.target.value);
        renderResults(results);
      }, 200);
    });

    searchInput.addEventListener('focus', async function() {
      await loadSearchIndex();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;
}
