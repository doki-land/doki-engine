/**
 * Doki Engine 迁移器基类
 *
 * 提供内容迁移的基础抽象类和通用功能。
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import {
    type FrontmatterFormat,
    normalizeFrontmatter,
    parseFrontmatter,
    toFrontmatter,
} from "./frontmatter.js";
import { convertTemplate, type TemplateEngine } from "./template.js";

/**
 * 迁移选项
 */
export interface MigrateOptions {
    /** 输入路径（文件或目录） */
    input: string;
    /** 输出目录 */
    output: string;
    /** Frontmatter 输出格式 */
    frontmatterFormat?: FrontmatterFormat;
    /** 是否转换模板语法 */
    convertTemplates?: boolean;
    /** 是否递归处理子目录 */
    recursive?: boolean;
    /** 文件扩展名过滤 */
    extensions?: string[];
}

/**
 * 迁移结果
 */
export interface MigrateResult {
    /** 是否成功 */
    success: boolean;
    /** 已处理的文件数 */
    filesProcessed: number;
    /** 跳过的文件数 */
    filesSkipped: number;
    /** 错误列表 */
    errors: string[];
    /** 处理的文件列表 */
    processedFiles?: string[];
}

/**
 * 单个文件的迁移结果
 */
export interface FileMigrateResult {
    /** 是否成功 */
    success: boolean;
    /** 源文件路径 */
    sourcePath: string;
    /** 目标文件路径 */
    targetPath?: string;
    /** 错误信息 */
    error?: string;
}

/**
 * 迁移器基类
 *
 * 所有具体迁移器的抽象基类，提供通用的文件处理和转换功能。
 */
export abstract class BaseMigrator {
    /**
     * 迁移器名称
     */
    abstract readonly name: string;

    /**
     * 迁移器描述
     */
    abstract readonly description: string;

    /**
     * 模板引擎类型
     */
    protected templateEngine?: TemplateEngine;

    /**
     * 执行迁移
     *
     * @param options 迁移选项
     * @returns 迁移结果
     */
    abstract migrate(options: MigrateOptions): Promise<MigrateResult>;

    /**
     * 确保目录存在
     *
     * @param dir 目录路径
     */
    protected async ensureDir(dir: string): Promise<void> {
        if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
        }
    }

    /**
     * 读取文件内容
     *
     * @param filePath 文件路径
     * @returns 文件内容
     */
    protected async readFile(filePath: string): Promise<string> {
        return readFile(filePath, "utf-8");
    }

    /**
     * 写入文件
     *
     * @param filePath 文件路径
     * @param content 文件内容
     */
    protected async writeFile(
        filePath: string,
        content: string,
    ): Promise<void> {
        await this.ensureDir(dirname(filePath));
        await writeFile(filePath, content, "utf-8");
    }

    /**
     * 转换 frontmatter 格式
     *
     * @param content 文件内容
     * @param targetFormat 目标格式
     * @returns 转换后的内容
     */
    protected convertFrontmatterFormat(
        content: string,
        targetFormat: FrontmatterFormat,
    ): string {
        const parsed = parseFrontmatter(content);
        const normalized = normalizeFrontmatter(parsed.data);
        return toFrontmatter(normalized, parsed.content, targetFormat);
    }

    /**
     * 转换模板语法
     *
     * @param content 模板内容
     * @returns 转换后的内容
     */
    protected convertTemplateSyntax(content: string): string {
        if (!this.templateEngine) {
            return content;
        }
        return convertTemplate(content, this.templateEngine);
    }

    /**
     * 处理单个文件
     *
     * @param sourcePath 源文件路径
     * @param targetPath 目标文件路径
     * @param options 迁移选项
     * @returns 处理结果
     */
    protected async processFile(
        sourcePath: string,
        targetPath: string,
        options: MigrateOptions,
    ): Promise<FileMigrateResult> {
        try {
            let content = await this.readFile(sourcePath);

            content = this.transformContent(content, sourcePath, options);

            if (options.frontmatterFormat) {
                content = this.convertFrontmatterFormat(
                    content,
                    options.frontmatterFormat,
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
     * 转换内容（子类可重写）
     *
     * @param content 原始内容
     * @param sourcePath 源文件路径
     * @param options 迁移选项
     * @returns 转换后的内容
     */
    protected transformContent(
        content: string,
        _sourcePath: string,
        options: MigrateOptions,
    ): string {
        if (options.convertTemplates && this.templateEngine) {
            return this.convertTemplateSyntax(content);
        }
        return content;
    }

    /**
     * 扫描目录获取文件列表
     *
     * @param dir 目录路径
     * @param baseDir 基础目录
     * @param extensions 文件扩展名过滤
     * @param recursive 是否递归
     * @returns 文件路径列表
     */
    protected async scanDirectory(
        dir: string,
        baseDir: string,
        extensions?: string[],
        recursive: boolean = true,
    ): Promise<string[]> {
        const files: string[] = [];
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory() && recursive) {
                const subFiles = await this.scanDirectory(
                    fullPath,
                    baseDir,
                    extensions,
                    recursive,
                );
                files.push(...subFiles);
            } else if (entry.isFile()) {
                if (!extensions || extensions.includes(extname(entry.name))) {
                    files.push(fullPath);
                }
            }
        }

        return files;
    }

    /**
     * 生成目标文件路径
     *
     * @param sourcePath 源文件路径
     * @param inputDir 输入目录
     * @param outputDir 输出目录
     * @param newExtension 新扩展名（可选）
     * @returns 目标文件路径
     */
    protected generateTargetPath(
        sourcePath: string,
        inputDir: string,
        outputDir: string,
        newExtension?: string,
    ): string {
        const relativePath = relative(inputDir, sourcePath);
        let targetPath = join(outputDir, relativePath);

        if (newExtension) {
            const ext = extname(targetPath);
            targetPath = targetPath.slice(0, -ext.length) + newExtension;
        }

        return targetPath;
    }

    /**
     * 验证输入路径
     *
     * @param input 输入路径
     * @returns 是否有效
     */
    protected validateInput(input: string): boolean {
        return existsSync(input);
    }

    /**
     * 创建迁移结果
     *
     * @param success 是否成功
     * @param processed 已处理数量
     * @param skipped 跳过数量
     * @param errors 错误列表
     * @param processedFiles 已处理文件列表
     * @returns 迁移结果
     */
    protected createResult(
        success: boolean,
        processed: number,
        skipped: number,
        errors: string[],
        processedFiles?: string[],
    ): MigrateResult {
        return {
            success,
            filesProcessed: processed,
            filesSkipped: skipped,
            errors,
            processedFiles,
        };
    }
}
