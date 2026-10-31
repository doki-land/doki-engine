/** Sass 编译模块 */

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import * as sass from "sass";
import type { SassConfig } from "./config.js";

/** Sass 编译结果 */
export interface SassCompileResult {
    /** 编译后的 CSS */
    css: string;
    /** Source Map */
    sourceMap?: string;
    /** 输出文件路径 */
    outputFilePath: string;
    /** 是否成功 */
    success: boolean;
    /** 错误信息 */
    error?: string;
}

/** Sass 编译选项 */
export interface SassCompileOptions {
    /** 文件路径（用于 Source Map） */
    filePath?: string;
    /** 导入路径 */
    includePaths?: string[];
    /** 输出样式 */
    style?: "expanded" | "compressed";
    /** 是否生成 Source Map */
    sourceMap?: boolean;
}

/** Sass 编译器 */
export class SassCompiler {
    private config: SassConfig;

    /**
     * 创建 Sass 编译器实例
     * @param config Sass 配置
     */
    constructor(config: SassConfig) {
        this.config = config;
    }

    /**
     * 编译 Sass 文件
     * @param filePath 输入文件路径
     * @param outputPath 输出文件路径
     * @returns 编译结果
     */
    async compileFile(
        filePath: string,
        outputPath: string,
    ): Promise<SassCompileResult> {
        try {
            const result = sass.compile(filePath, {
                style: this.config.style,
                sourceMap: this.config.sourceMap,
                loadPaths: this.config.includePaths,
            });

            const outputFilePath = outputPath;
            const outputDir = dirname(outputPath);

            await mkdir(outputDir, { recursive: true });

            await writeFile(outputPath, result.css, "utf-8");

            if (this.config.sourceMap && result.sourceMap) {
                const sourceMapPath = `${outputPath}.map`;
                await writeFile(
                    sourceMapPath,
                    JSON.stringify(result.sourceMap),
                    "utf-8",
                );
            }

            return {
                css: result.css,
                sourceMap: result.sourceMap
                    ? JSON.stringify(result.sourceMap)
                    : undefined,
                outputFilePath,
                success: true,
            };
        } catch (error) {
            return {
                css: "",
                outputFilePath: outputPath,
                success: false,
                error: (error as Error).message,
            };
        }
    }

    /**
     * 编译 Sass 字符串
     * @param source Sass 源代码字符串
     * @param options 编译选项
     * @returns 编译结果
     */
    async compileString(
        source: string,
        options?: SassCompileOptions,
    ): Promise<SassCompileResult> {
        try {
            const style = options?.style ?? this.config.style;
            const sourceMap = options?.sourceMap ?? this.config.sourceMap;
            const includePaths =
                options?.includePaths ?? this.config.includePaths;

            const result = sass.compileString(source, {
                style,
                sourceMap,
                loadPaths: includePaths,
                sourceMapIncludeSources: sourceMap,
            });

            return {
                css: result.css,
                sourceMap: result.sourceMap
                    ? JSON.stringify(result.sourceMap)
                    : undefined,
                outputFilePath: options?.filePath ?? "",
                success: true,
            };
        } catch (error) {
            return {
                css: "",
                outputFilePath: options?.filePath ?? "",
                success: false,
                error: (error as Error).message,
            };
        }
    }

    /**
     * 扫描并编译目录中的所有 Sass 文件
     * @param inputDir 输入目录
     * @param outputDir 输出目录
     * @returns 编译结果数组
     */
    async compileDirectory(
        inputDir: string,
        outputDir: string,
    ): Promise<SassCompileResult[]> {
        const results: SassCompileResult[] = [];
        const sassFiles = await this.findSassFiles(inputDir);

        for (const filePath of sassFiles) {
            const outputPath = getOutputPath(filePath, outputDir);
            const result = await this.compileFile(filePath, outputPath);
            results.push(result);
        }

        return results;
    }

    /**
     * 递归查找目录中的 Sass 文件
     * @param dir 目录路径
     * @returns Sass 文件路径数组
     */
    private async findSassFiles(dir: string): Promise<string[]> {
        const files: string[] = [];
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                const subFiles = await this.findSassFiles(fullPath);
                files.push(...subFiles);
            } else if (entry.isFile() && isSassFile(entry.name)) {
                files.push(fullPath);
            }
        }

        return files;
    }
}

/**
 * 检查是否为 Sass 文件
 * @param filePath 文件路径
 * @returns 是否为 Sass 文件
 */
export function isSassFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    return ext === ".scss" || ext === ".sass";
}

/**
 * 获取输出文件路径
 * @param inputPath 输入文件路径
 * @param outputDir 输出目录
 * @returns 输出文件路径
 */
export function getOutputPath(inputPath: string, outputDir: string): string {
    const ext = extname(inputPath);
    const baseName = basename(inputPath, ext);
    return join(outputDir, `${baseName}.css`);
}

/**
 * 编译单个 Sass 文件
 * @param filePath 输入文件路径
 * @param outputPath 输出文件路径
 * @param config Sass 配置
 * @returns 编译结果
 */
export async function compileSass(
    filePath: string,
    outputPath: string,
    config: SassConfig,
): Promise<SassCompileResult> {
    const compiler = new SassCompiler(config);
    return compiler.compileFile(filePath, outputPath);
}
