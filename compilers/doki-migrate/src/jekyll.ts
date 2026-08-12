/**
 * Doki Engine Jekyll 迁移器
 *
 * 将 Jekyll 站点内容迁移到 Doki Engine 格式。
 */

import {
    BaseMigrator,
    type MigrateOptions,
    type MigrateResult,
    type FileMigrateResult,
} from "./base.js";
import {
    parseFrontmatter,
    toFrontmatter,
    normalizeFrontmatter,
} from "./frontmatter.js";
import { convertJekyllTemplate } from "./template.js";

/**
 * Jekyll 迁移器
 *
 * 支持：
 * - 解析 Jekyll 的 YAML frontmatter
 * - 转换 Liquid 模板语法到 Doki 模板语法
 * - 处理 Jekyll 特有的内容结构
 */
export class JekyllMigrator extends BaseMigrator {
    readonly name = "jekyll";
    readonly description = "Jekyll 静态站点生成器内容迁移器";
    protected templateEngine = "jekyll" as const;

    /**
     * 执行 Jekyll 内容迁移
     *
     * @param options 迁移选项
     * @returns 迁移结果
     */
    async migrate(options: MigrateOptions): Promise<MigrateResult> {
        const {
            input,
            output,
            frontmatterFormat = "yaml",
            recursive = true,
        } = options;

        if (!this.validateInput(input)) {
            return this.createResult(false, 0, 0, [`输入路径不存在: ${input}`]);
        }

        const errors: string[] = [];
        const processedFiles: string[] = [];
        let filesProcessed = 0;
        let filesSkipped = 0;

        try {
            await this.ensureDir(output);

            const files = await this.scanDirectory(
                input,
                input,
                [".md", ".markdown", ".html", ".htm"],
                recursive,
            );

            for (const file of files) {
                const targetPath = this.generateJekyllTargetPath(
                    file,
                    input,
                    output,
                );
                const result = await this.processJekyllFile(
                    file,
                    targetPath,
                    frontmatterFormat,
                );

                if (result.success) {
                    filesProcessed++;
                    processedFiles.push(file);
                } else {
                    filesSkipped++;
                    if (result.error) {
                        errors.push(`${file}: ${result.error}`);
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
     * 生成 Jekyll 文件的目标路径
     *
     * 处理 Jekyll 特有的日期前缀命名
     *
     * @param sourcePath 源文件路径
     * @param inputDir 输入目录
     * @param outputDir 输出目录
     * @returns 目标文件路径
     */
    private generateJekyllTargetPath(
        sourcePath: string,
        inputDir: string,
        outputDir: string,
    ): string {
        const relativePath = this.getRelativePath(sourcePath, inputDir);
        const fileName = this.extractFileName(relativePath);

        const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
        if (dateMatch) {
            const name = dateMatch[2];
            const dir = this.extractDirectory(relativePath);

            const newRelativePath = dir ? `${dir}/${name}.md` : `${name}.md`;
            return `${outputDir}/${newRelativePath}`;
        }

        return this.generateTargetPath(sourcePath, inputDir, outputDir);
    }

    /**
     * 获取相对路径
     *
     * @param fullPath 完整路径
     * @param baseDir 基础目录
     * @returns 相对路径
     */
    private getRelativePath(fullPath: string, baseDir: string): string {
        const normalizedFull = fullPath.replace(/\\/g, "/");
        const normalizedBase = baseDir.replace(/\\/g, "/");

        if (normalizedFull.startsWith(normalizedBase)) {
            return normalizedFull
                .slice(normalizedBase.length)
                .replace(/^\//, "");
        }
        return normalizedFull;
    }

    /**
     * 提取文件名（不含扩展名）
     *
     * @param path 文件路径
     * @returns 文件名
     */
    private extractFileName(path: string): string {
        const parts = path.split("/");
        const fullName = parts[parts.length - 1] || "";
        const dotIndex = fullName.lastIndexOf(".");
        return dotIndex > 0 ? fullName.slice(0, dotIndex) : fullName;
    }

    /**
     * 提取目录路径
     *
     * @param path 文件路径
     * @returns 目录路径
     */
    private extractDirectory(path: string): string {
        const parts = path.split("/");
        return parts.slice(0, -1).join("/");
    }

    /**
     * 处理单个 Jekyll 文件
     *
     * @param sourcePath 源文件路径
     * @param targetPath 目标文件路径
     * @param frontmatterFormat 目标 frontmatter 格式
     * @returns 处理结果
     */
    private async processJekyllFile(
        sourcePath: string,
        targetPath: string,
        frontmatterFormat: "toml" | "yaml" | "json",
    ): Promise<FileMigrateResult> {
        try {
            let content = await this.readFile(sourcePath);

            content = this.transformJekyllContent(content);

            const parsed = parseFrontmatter(content);
            const normalized = this.normalizeJekyllFrontmatter(
                parsed.data,
                sourcePath,
            );

            content = toFrontmatter(
                normalized,
                parsed.content,
                frontmatterFormat,
            );

            await this.writeFile(targetPath, content);

            return {
                success: true,
                sourcePath,
                targetPath,
            };
        } catch (error) {
            return {
                success: false,
                sourcePath,
                error: (error as Error).message,
            };
        }
    }

    /**
     * 转换 Jekyll 内容
     *
     * @param content 原始内容
     * @returns 转换后的内容
     */
    private transformJekyllContent(content: string): string {
        return convertJekyllTemplate(content);
    }

    /**
     * 标准化 Jekyll frontmatter 字段
     *
     * @param data 原始数据
     * @param sourcePath 源文件路径（用于提取日期）
     * @returns 标准化后的数据
     */
    private normalizeJekyllFrontmatter(
        data: Record<string, unknown>,
        sourcePath: string,
    ): Record<string, unknown> {
        const normalized = normalizeFrontmatter(data);

        const jekyllMappings: Record<string, string | undefined> = {
            permalink: "url",
            excerpt: "description",
            categories: "category",
            tags: "tags",
            layout: "layout",
            published: "draft",
            author: "author",
            last_modified_at: "updated",
            image: "image",
            featured: undefined,
            toc: undefined,
            comments: undefined,
        };

        for (const [key, newKey] of Object.entries(jekyllMappings)) {
            if (key in normalized) {
                if (newKey === undefined) {
                    delete normalized[key];
                } else if (!(newKey in normalized)) {
                    if (key === "published") {
                        normalized[newKey] = !normalized[key];
                    } else {
                        normalized[newKey] = normalized[key];
                    }
                    if (newKey !== key) {
                        delete normalized[key];
                    }
                }
            }
        }

        if (!normalized["date"]) {
            const fileName = this.extractFileName(
                this.getRelativePath(sourcePath, ""),
            );
            const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})/);
            if (dateMatch) {
                normalized["date"] = dateMatch[1];
            }
        }

        if (
            Array.isArray(normalized["categories"]) &&
            normalized["categories"].length > 0
        ) {
            normalized["category"] = normalized["categories"][0];
            delete normalized["categories"];
        }

        return normalized;
    }
}
