/**
 * Doki Engine Hexo 迁移器
 *
 * 将 Hexo 站点内容迁移到 Doki Engine 格式。
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
import { convertHexoTemplate } from "./template.js";

/**
 * Hexo 迁移器
 *
 * 支持：
 * - 解析 Hexo 的 YAML frontmatter
 * - 转换 EJS/Nunjucks 模板语法到 Doki 模板语法
 * - 处理 Hexo 特有的内容结构
 */
export class HexoMigrator extends BaseMigrator {
    readonly name = "hexo";
    readonly description = "Hexo 静态站点生成器内容迁移器";
    protected templateEngine = "hexo" as const;

    /**
     * 执行 Hexo 内容迁移
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
                [".md", ".ejs", ".njk", ".html", ".htm"],
                recursive,
            );

            for (const file of files) {
                const targetPath = this.generateHexoTargetPath(
                    file,
                    input,
                    output,
                );
                const result = await this.processHexoFile(
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
     * 生成 Hexo 文件的目标路径
     *
     * 将 .ejs 和 .njk 文件转换为 .html 文件
     *
     * @param sourcePath 源文件路径
     * @param inputDir 输入目录
     * @param outputDir 输出目录
     * @returns 目标文件路径
     */
    private generateHexoTargetPath(
        sourcePath: string,
        inputDir: string,
        outputDir: string,
    ): string {
        const ext = sourcePath.slice(-4).toLowerCase();

        if (ext === ".ejs" || ext === ".njk") {
            return this.generateTargetPath(
                sourcePath,
                inputDir,
                outputDir,
                ".html",
            );
        }

        return this.generateTargetPath(sourcePath, inputDir, outputDir);
    }

    /**
     * 处理单个 Hexo 文件
     *
     * @param sourcePath 源文件路径
     * @param targetPath 目标文件路径
     * @param frontmatterFormat 目标 frontmatter 格式
     * @returns 处理结果
     */
    private async processHexoFile(
        sourcePath: string,
        targetPath: string,
        frontmatterFormat: "toml" | "yaml" | "json",
    ): Promise<FileMigrateResult> {
        try {
            let content = await this.readFile(sourcePath);

            content = this.transformHexoContent(content);

            const parsed = parseFrontmatter(content);
            const normalized = this.normalizeHexoFrontmatter(parsed.data);

            const ext = sourcePath.slice(-3).toLowerCase();
            if (ext === ".md") {
                content = toFrontmatter(
                    normalized,
                    parsed.content,
                    frontmatterFormat,
                );
            } else {
                content = toFrontmatter(
                    normalized,
                    parsed.content,
                    frontmatterFormat,
                );
            }

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
     * 转换 Hexo 内容
     *
     * @param content 原始内容
     * @returns 转换后的内容
     */
    private transformHexoContent(content: string): string {
        return convertHexoTemplate(content);
    }

    /**
     * 标准化 Hexo frontmatter 字段
     *
     * @param data 原始数据
     * @returns 标准化后的数据
     */
    private normalizeHexoFrontmatter(
        data: Record<string, unknown>,
    ): Record<string, unknown> {
        const normalized = normalizeFrontmatter(data);

        const hexoMappings: Record<string, string | undefined> = {
            updated: "updated",
            date: "date",
            categories: "category",
            tags: "tags",
            permalink: "url",
            layout: "layout",
            comments: undefined,
            photos: undefined,
            link: undefined,
            _content: undefined,
        };

        for (const [key, newKey] of Object.entries(hexoMappings)) {
            if (key in normalized) {
                if (newKey === undefined) {
                    delete normalized[key];
                } else if (!(newKey in normalized)) {
                    normalized[newKey] = normalized[key];
                    if (newKey !== key) {
                        delete normalized[key];
                    }
                }
            }
        }

        if (
            Array.isArray(normalized["categories"]) &&
            normalized["categories"].length > 0
        ) {
            const cats = normalized["categories"] as unknown[];
            normalized["category"] = cats[cats.length - 1];
            delete normalized["categories"];
        }

        return normalized;
    }
}
