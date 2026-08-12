/**
 * Doki Engine Hugo 迁移器
 *
 * 将 Hugo 站点内容迁移到 Doki Engine 格式。
 */

import {
    BaseMigrator,
    type MigrateOptions,
    type MigrateResult,
    type FileMigrateResult,
} from "./base.js";
import {
    parseTomlFrontmatter,
    parseFrontmatter,
    toFrontmatter,
    normalizeFrontmatter,
} from "./frontmatter.js";
import { convertHugoTemplate } from "./template.js";

/**
 * Hugo 迁移器
 *
 * 支持：
 * - 解析 Hugo 的 TOML (+++) 和 YAML (---) frontmatter
 * - 转换 Go Template 语法到 Doki 模板语法
 * - 处理 Hugo 特有的内容结构
 */
export class HugoMigrator extends BaseMigrator {
    readonly name = "hugo";
    readonly description = "Hugo 静态站点生成器内容迁移器";
    protected templateEngine = "hugo" as const;

    /**
     * 执行 Hugo 内容迁移
     *
     * @param options 迁移选项
     * @returns 迁移结果
     */
    async migrate(options: MigrateOptions): Promise<MigrateResult> {
        const {
            input,
            output,
            frontmatterFormat = "toml",
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
                [".md", ".html", ".htm"],
                recursive,
            );

            for (const file of files) {
                const targetPath = this.generateTargetPath(file, input, output);
                const result = await this.processHugoFile(
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
     * 处理单个 Hugo 文件
     *
     * @param sourcePath 源文件路径
     * @param targetPath 目标文件路径
     * @param frontmatterFormat 目标 frontmatter 格式
     * @returns 处理结果
     */
    private async processHugoFile(
        sourcePath: string,
        targetPath: string,
        frontmatterFormat: "toml" | "yaml" | "json",
    ): Promise<FileMigrateResult> {
        try {
            let content = await this.readFile(sourcePath);

            content = this.transformHugoContent(content);

            const parsed = this.parseHugoFrontmatter(content);
            const normalized = this.normalizeHugoFrontmatter(parsed.data);

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
     * 解析 Hugo frontmatter
     *
     * 支持 TOML (+++) 和 YAML (---) 格式
     *
     * @param content 文件内容
     * @returns 解析结果
     */
    private parseHugoFrontmatter(content: string): {
        data: Record<string, unknown>;
        content: string;
    } {
        const trimmed = content.trim();

        if (trimmed.startsWith("+++")) {
            return parseTomlFrontmatter(trimmed);
        }

        return parseFrontmatter(trimmed);
    }

    /**
     * 转换 Hugo 内容
     *
     * @param content 原始内容
     * @returns 转换后的内容
     */
    private transformHugoContent(content: string): string {
        return convertHugoTemplate(content);
    }

    /**
     * 标准化 Hugo frontmatter 字段
     *
     * @param data 原始数据
     * @returns 标准化后的数据
     */
    private normalizeHugoFrontmatter(
        data: Record<string, unknown>,
    ): Record<string, unknown> {
        const normalized = normalizeFrontmatter(data);

        const hugoMappings: Record<string, string | null> = {
            lastmod: "updated",
            publishDate: "date",
            slug: "url",
            aliases: "aliases",
            weight: "weight",
            draft: "draft",
            layout: "layout",
            type: "type",
            outputs: null,
            resources: null,
            frontmatter: null,
        };

        for (const [key, newKey] of Object.entries(hugoMappings)) {
            if (key in normalized) {
                if (newKey === null) {
                    delete normalized[key];
                } else if (!(newKey in normalized)) {
                    normalized[newKey] = normalized[key];
                    if (newKey !== key) {
                        delete normalized[key];
                    }
                }
            }
        }

        if (Array.isArray(normalized["tags"])) {
            normalized["tags"] = normalized["tags"];
        }

        if (Array.isArray(normalized["categories"])) {
            normalized["category"] = normalized["categories"][0];
            delete normalized["categories"];
        }

        return normalized;
    }
}
