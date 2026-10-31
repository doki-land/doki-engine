/**
 * Doki Engine WordPress 迁移器
 *
 * 将 WordPress 导出文件（WXR 格式）迁移到 Doki Engine 格式。
 */

import { parseString } from "xml2js";
import {
    BaseMigrator,
    type FileMigrateResult,
    type MigrateOptions,
    type MigrateResult,
} from "./base.js";
import { toFrontmatter } from "./frontmatter.js";

/**
 * WordPress 文章数据
 */
interface WordPressPost {
    title: string;
    content: string;
    date: string;
    modified: string;
    status: string;
    type: string;
    slug: string;
    categories: string[];
    tags: string[];
    author: string;
    excerpt: string;
    featuredImage?: string;
}

/**
 * WordPress 导出文件解析结果
 */
interface WordPressExport {
    posts: WordPressPost[];
    categories: string[];
    tags: string[];
    authors: string[];
}

/**
 * XML 解析节点
 */
interface XmlNode {
    $?: Record<string, string>;
    _?: string;
    [key: string]: unknown;
}

/**
 * XML 解析结果
 */
interface XmlParsed {
    rss?: {
        channel?: XmlNode[];
    };
}

/**
 * WordPress 迁移器
 *
 * 支持：
 * - 解析 WordPress XML 导出文件（WXR 格式）
 * - 提取文章标题、内容、日期、分类、标签
 * - 转换为 Markdown 格式
 * - 生成 TOML/YAML/JSON frontmatter
 */
export class WordPressMigrator extends BaseMigrator {
    readonly name = "wordpress";
    readonly description = "WordPress 内容迁移器（支持 WXR 导出格式）";

    /**
     * 执行 WordPress 内容迁移
     *
     * @param options 迁移选项
     * @returns 迁移结果
     */
    async migrate(options: MigrateOptions): Promise<MigrateResult> {
        const { input, output, frontmatterFormat = "yaml" } = options;

        if (!this.validateInput(input)) {
            return this.createResult(false, 0, 0, [`输入文件不存在: ${input}`]);
        }

        const errors: string[] = [];
        const processedFiles: string[] = [];
        let filesProcessed = 0;
        let filesSkipped = 0;

        try {
            await this.ensureDir(output);

            const xmlContent = await this.readFile(input);
            const exportData = await this.parseWordPressExport(xmlContent);

            for (const post of exportData.posts) {
                if (post.type !== "post" && post.type !== "page") {
                    continue;
                }

                const result = await this.processWordPressPost(
                    post,
                    output,
                    frontmatterFormat,
                );

                if (result.success) {
                    filesProcessed++;
                    processedFiles.push(result.targetPath || post.slug);
                } else {
                    filesSkipped++;
                    if (result.error) {
                        errors.push(`${post.slug}: ${result.error}`);
                    }
                }
            }

            return this.createResult(
                errors.length === 0,
                filesProcessed,
                filesSkipped,
                errors,
                processedFiles,
            );
        } catch (error) {
            return this.createResult(false, filesProcessed, filesSkipped, [
                (error as Error).message,
            ]);
        }
    }

    /**
     * 解析 WordPress 导出文件
     *
     * @param xmlContent XML 内容
     * @returns 解析结果
     */
    private async parseWordPressExport(
        xmlContent: string,
    ): Promise<WordPressExport> {
        const result: WordPressExport = {
            posts: [],
            categories: [],
            tags: [],
            authors: [],
        };

        try {
            const parsed = await this.parseXml(xmlContent);
            const channel = parsed.rss?.channel?.[0];

            if (!channel) {
                return result;
            }

            const wpCategory = channel["wp:category"] as XmlNode[] | undefined;
            if (wpCategory) {
                for (const cat of wpCategory) {
                    const catName = cat["wp:cat_name"] as string[] | undefined;
                    const name = catName?.[0];
                    if (name) {
                        result.categories.push(name);
                    }
                }
            }

            const wpTag = channel["wp:tag"] as XmlNode[] | undefined;
            if (wpTag) {
                for (const tag of wpTag) {
                    const tagName = tag["wp:tag_name"] as string[] | undefined;
                    const name = tagName?.[0];
                    if (name) {
                        result.tags.push(name);
                    }
                }
            }

            const items = (channel.item || []) as XmlNode[];
            for (const item of items) {
                const postTypeArr = item["wp:post_type"] as
                    | string[]
                    | undefined;
                const postType = postTypeArr?.[0];

                if (postType === "post" || postType === "page") {
                    const post = this.extractPost(item);
                    result.posts.push(post);

                    if (post.author && !result.authors.includes(post.author)) {
                        result.authors.push(post.author);
                    }
                }
            }

            return result;
        } catch (error) {
            throw new Error(
                `解析 WordPress 导出文件失败: ${(error as Error).message}`,
            );
        }
    }

    /**
     * 解析 XML
     *
     * @param xmlContent XML 内容
     * @returns 解析后的对象
     */
    private parseXml(xmlContent: string): Promise<XmlParsed> {
        return new Promise((resolve, reject) => {
            parseString(
                xmlContent,
                {
                    explicitArray: true,
                    explicitRoot: true,
                },
                (err: Error | null, result: unknown) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result as XmlParsed);
                    }
                },
            );
        });
    }

    /**
     * 从 XML item 提取文章数据
     *
     * @param item XML item 对象
     * @returns 文章数据
     */
    private extractPost(item: XmlNode): WordPressPost {
        const post: WordPressPost = {
            title: "",
            content: "",
            date: "",
            modified: "",
            status: "publish",
            type: "post",
            slug: "",
            categories: [],
            tags: [],
            author: "",
            excerpt: "",
        };

        post.title = this.getStringValue(item, "title");
        post.content =
            this.getStringValue(item, "content:encoded") ||
            this.getStringValue(item, "description");
        post.excerpt = this.getStringValue(item, "excerpt:encoded");
        post.slug =
            this.getStringValue(item, "wp:post_name") ||
            this.generateSlug(post.title);
        post.status = this.getStringValue(item, "wp:status") || "publish";
        post.type = this.getStringValue(item, "wp:post_type") || "post";
        post.author = this.getStringValue(item, "dc:creator") || "";

        const postDate = this.getStringValue(item, "wp:post_date");
        if (postDate) {
            post.date = this.formatDate(postDate);
        }

        const postModified = this.getStringValue(item, "wp:post_modified");
        if (postModified) {
            post.modified = this.formatDate(postModified);
        }

        const categories = item.category as XmlNode[] | undefined;
        if (categories) {
            for (const cat of categories) {
                const domain = cat.$?.domain || "";
                const name = cat._ || "";

                if (domain === "category" && name) {
                    post.categories.push(name);
                } else if (domain === "post_tag" && name) {
                    post.tags.push(name);
                }
            }
        }

        return post;
    }

    /**
     * 获取字符串值
     *
     * @param obj 对象
     * @param key 键名
     * @returns 字符串值
     */
    private getStringValue(obj: XmlNode, key: string): string {
        const value = obj[key];
        if (Array.isArray(value) && value.length > 0) {
            return String(value[0] || "");
        }
        return "";
    }

    /**
     * 格式化日期
     *
     * @param dateStr 日期字符串
     * @returns 格式化后的日期
     */
    private formatDate(dateStr: string): string {
        try {
            const date = new Date(dateStr);
            if (Number.isNaN(date.getTime())) {
                return dateStr.split(" ")[0] || "";
            }
            return date.toISOString().split("T")[0];
        } catch {
            return dateStr.split(" ")[0] || "";
        }
    }

    /**
     * 生成 slug
     *
     * @param title 标题
     * @returns slug
     */
    private generateSlug(title: string): string {
        return title
            .toLowerCase()
            .replace(/[^\w\u4e00-\u9fa5]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 100);
    }

    /**
     * 处理单个 WordPress 文章
     *
     * @param post 文章数据
     * @param outputDir 输出目录
     * @param frontmatterFormat frontmatter 格式
     * @returns 处理结果
     */
    private async processWordPressPost(
        post: WordPressPost,
        outputDir: string,
        frontmatterFormat: "toml" | "yaml" | "json",
    ): Promise<FileMigrateResult> {
        try {
            const frontmatter = this.buildFrontmatter(post);
            const content = this.convertToMarkdown(post.content);

            const fullContent = toFrontmatter(
                frontmatter,
                content,
                frontmatterFormat,
            );

            const fileName = post.slug || this.generateSlug(post.title);
            const subDir = post.type === "page" ? "" : "posts";
            const targetDir = subDir ? `${outputDir}/${subDir}` : outputDir;
            const targetPath = `${targetDir}/${fileName}.md`;

            await this.writeFile(targetPath, fullContent);

            return {
                success: true,
                sourcePath: post.slug,
                targetPath,
            };
        } catch (error) {
            return {
                success: false,
                sourcePath: post.slug,
                error: (error as Error).message,
            };
        }
    }

    /**
     * 构建 frontmatter 数据
     *
     * @param post 文章数据
     * @returns frontmatter 数据
     */
    private buildFrontmatter(post: WordPressPost): Record<string, unknown> {
        const frontmatter: Record<string, unknown> = {
            title: post.title,
            date: post.date,
            draft: post.status !== "publish",
        };

        if (post.modified) {
            frontmatter.updated = post.modified;
        }

        if (post.author) {
            frontmatter.author = post.author;
        }

        if (post.excerpt) {
            frontmatter.description = post.excerpt;
        }

        if (post.categories.length > 0) {
            frontmatter.category = post.categories[0];
        }

        if (post.tags.length > 0) {
            frontmatter.tags = post.tags;
        }

        if (post.featuredImage) {
            frontmatter.image = post.featuredImage;
        }

        if (post.type === "page") {
            frontmatter.layout = "page";
        }

        return frontmatter;
    }

    /**
     * 将 HTML 内容转换为 Markdown
     *
     * @param html HTML 内容
     * @returns Markdown 内容
     */
    private convertToMarkdown(html: string): string {
        let markdown = html;

        markdown = markdown.replace(/<!--.*?-->/gs, "");

        markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n# $1\n");
        markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n## $1\n");
        markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n### $1\n");
        markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "\n#### $1\n");
        markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, "\n##### $1\n");
        markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, "\n###### $1\n");

        markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
        markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
        markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
        markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");

        markdown = markdown.replace(
            /<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi,
            "[$2]($1)",
        );

        markdown = markdown.replace(
            /<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi,
            "![$2]($1)",
        );
        markdown = markdown.replace(
            /<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*\/?>/gi,
            "![$1]($2)",
        );
        markdown = markdown.replace(
            /<img[^>]*src=["']([^"']+)["'][^>]*\/?>/gi,
            "![]($1)",
        );

        markdown = markdown.replace(
            /<blockquote[^>]*>(.*?)<\/blockquote>/gis,
            "\n> $1\n",
        );

        markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");
        markdown = markdown.replace(
            /<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis,
            "\n```\n$1\n```\n",
        );

        markdown = markdown.replace(/<ul[^>]*>(.*?)<\/ul>/gis, "$1");
        markdown = markdown.replace(/<ol[^>]*>(.*?)<\/ol>/gis, "$1");
        markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");

        markdown = markdown.replace(/<br\s*\/?>/gi, "\n");
        markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gis, "$1\n\n");

        markdown = markdown.replace(/<hr\s*\/?>/gi, "\n---\n");

        markdown = markdown.replace(/<div[^>]*>(.*?)<\/div>/gis, "$1");
        markdown = markdown.replace(/<span[^>]*>(.*?)<\/span>/gi, "$1");
        markdown = markdown.replace(/<article[^>]*>(.*?)<\/article>/gis, "$1");
        markdown = markdown.replace(/<section[^>]*>(.*?)<\/section>/gis, "$1");

        markdown = markdown.replace(/<[^>]+>/g, "");

        markdown = markdown.replace(/&nbsp;/g, " ");
        markdown = markdown.replace(/&amp;/g, "&");
        markdown = markdown.replace(/&lt;/g, "<");
        markdown = markdown.replace(/&gt;/g, ">");
        markdown = markdown.replace(/&quot;/g, '"');
        markdown = markdown.replace(/&#(\d+);/g, (_, num) =>
            String.fromCharCode(parseInt(num, 10)),
        );

        markdown = markdown.replace(/\n{3,}/g, "\n\n");
        markdown = markdown.trim();

        return markdown;
    }
}
