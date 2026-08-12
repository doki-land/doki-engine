/** Doki Engine 数据文件加载模块 */

import { readdir, readFile } from "fs/promises";
import { existsSync, statSync } from "fs";
import { join, extname, relative, dirname, basename } from "path";
import { parse as parseToml } from "smol-toml";

/** 支持的数据文件扩展名 */
const SUPPORTED_EXTENSIONS = [".json", ".yaml", ".yml", ".toml"] as const;

/** 数据文件扩展名类型 */
export type DataFileExtension = (typeof SUPPORTED_EXTENSIONS)[number];

/** 数据加载选项 */
export interface DataLoadOptions {
    /** 数据目录 */
    dataDir: string;
    /** 是否递归加载子目录 */
    recursive?: boolean;
}

/** 数据文件信息 */
export interface DataFileInfo {
    /** 文件路径 */
    path: string;
    /** 相对路径 */
    relativePath: string;
    /** 文件扩展名 */
    extension: DataFileExtension;
    /** 嵌套键路径 */
    keyPath: string[];
}

/**
 * 解析 JSON 数据
 * @param content 文件内容
 * @returns 解析后的数据对象
 */
function parseJson(content: string): unknown {
    return JSON.parse(content);
}

/**
 * 解析 YAML 数据
 * @param content 文件内容
 * @returns 解析后的数据对象
 */
async function parseYaml(content: string): Promise<unknown> {
    const { parse } = await import("yaml");
    return parse(content);
}

/**
 * 解析 TOML 数据
 * @param content 文件内容
 * @returns 解析后的数据对象
 */
function parseTomlContent(content: string): unknown {
    return parseToml(content);
}

/**
 * 根据文件扩展名解析数据文件
 * @param filePath 文件路径
 * @param content 文件内容
 * @returns 解析后的数据对象
 */
async function parseDataFile(
    filePath: string,
    content: string,
): Promise<unknown> {
    const ext = extname(filePath).toLowerCase() as DataFileExtension;

    switch (ext) {
        case ".json":
            return parseJson(content);
        case ".yaml":
        case ".yml":
            return parseYaml(content);
        case ".toml":
            return parseTomlContent(content);
        default:
            throw new Error(`Unsupported data file extension: ${ext}`);
    }
}

/**
 * 检查文件是否为支持的数据文件
 * @param filename 文件名
 * @returns 是否为支持的数据文件
 */
function isDataFile(filename: string): boolean {
    const ext = extname(filename).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext as DataFileExtension);
}

/**
 * 生成嵌套键路径
 * @param relativePath 相对路径
 * @returns 键路径数组
 */
function generateKeyPath(relativePath: string): string[] {
    const dir = dirname(relativePath);
    const name = basename(relativePath, extname(relativePath));

    if (dir === "." || dir === "") {
        return [name];
    }

    const dirParts = dir.split(/[/\\]/);
    return [...dirParts, name];
}

/**
 * 将键路径数组转换为嵌套对象
 * @param keyPath 键路径数组
 * @param value 值
 * @returns 嵌套对象
 */
function createNestedObject(
    keyPath: string[],
    value: unknown,
): Record<string, unknown> {
    if (keyPath.length === 0) {
        return value as Record<string, unknown>;
    }

    const result: Record<string, unknown> = {};
    let current = result;

    for (let i = 0; i < keyPath.length - 1; i++) {
        const key = keyPath[i];
        current[key] = {};
        current = current[key] as Record<string, unknown>;
    }

    current[keyPath[keyPath.length - 1]] = value;
    return result;
}

/**
 * 深度合并两个对象
 * @param target 目标对象
 * @param source 源对象
 * @returns 合并后的对象
 */
function deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
): Record<string, unknown> {
    const result = { ...target };

    for (const key of Object.keys(source)) {
        if (
            key in result &&
            typeof result[key] === "object" &&
            result[key] !== null &&
            !Array.isArray(result[key]) &&
            typeof source[key] === "object" &&
            source[key] !== null &&
            !Array.isArray(source[key])
        ) {
            result[key] = deepMerge(
                result[key] as Record<string, unknown>,
                source[key] as Record<string, unknown>,
            );
        } else {
            result[key] = source[key];
        }
    }

    return result;
}

/**
 * 扫描数据目录
 * @param dataDir 数据目录
 * @returns 数据文件信息列表
 */
async function scanDataDirectory(dataDir: string): Promise<DataFileInfo[]> {
    const files: DataFileInfo[] = [];

    if (!existsSync(dataDir)) {
        return files;
    }

    async function scan(dir: string, baseDir: string): Promise<void> {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);

            if (entry.isDirectory()) {
                await scan(fullPath, baseDir);
            } else if (entry.isFile() && isDataFile(entry.name)) {
                const relPath = relative(baseDir, fullPath);
                files.push({
                    path: fullPath,
                    relativePath: relPath,
                    extension: extname(
                        entry.name,
                    ).toLowerCase() as DataFileExtension,
                    keyPath: generateKeyPath(relPath),
                });
            }
        }
    }

    await scan(dataDir, dataDir);
    return files;
}

/**
 * 加载单个数据文件
 * @param fileInfo 文件信息
 * @returns 解析后的数据对象
 */
async function loadDataFile(
    fileInfo: DataFileInfo,
): Promise<Record<string, unknown>> {
    try {
        const content = await readFile(fileInfo.path, "utf-8");
        const data = await parseDataFile(fileInfo.path, content);
        return createNestedObject(fileInfo.keyPath, data);
    } catch (error) {
        console.warn(`Failed to load data file: ${fileInfo.path}`);
        console.warn((error as Error).message);
        return {};
    }
}

/**
 * 加载数据目录中的所有数据文件
 * @param dataDir 数据目录路径
 * @returns 合并后的数据对象
 */
export async function loadData(
    dataDir: string,
): Promise<Record<string, unknown>> {
    if (!existsSync(dataDir)) {
        return {};
    }

    const stat = statSync(dataDir);
    if (!stat.isDirectory()) {
        console.warn(`Data path is not a directory: ${dataDir}`);
        return {};
    }

    const files = await scanDataDirectory(dataDir);

    if (files.length === 0) {
        return {};
    }

    let result: Record<string, unknown> = {};

    for (const file of files) {
        const data = await loadDataFile(file);
        result = deepMerge(result, data);
    }

    return result;
}

/**
 * 监视数据目录变化
 * @param dataDir 数据目录
 * @param callback 变化回调
 * @returns 取消监视函数
 */
export function watchDataDirectory(
    dataDir: string,
    callback: (filePath: string) => void,
): () => void {
    if (!existsSync(dataDir)) {
        return () => {};
    }

    let debounceTimer: NodeJS.Timeout | null = null;

    const { watch } = require("fs");
    const watcher = watch(
        dataDir,
        { recursive: true, persistent: false },
        (_eventType: string, filename: string | Buffer | null) => {
            if (!filename) return;

            if (isDataFile(filename.toString())) {
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }
                debounceTimer = setTimeout(() => {
                    callback(join(dataDir, filename.toString()));
                }, 100);
            }
        },
    );

    return () => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        watcher.close();
    };
}

/**
 * 获取数据文件扩展名列表
 * @returns 支持的扩展名数组
 */
export function getSupportedExtensions(): readonly DataFileExtension[] {
    return SUPPORTED_EXTENSIONS;
}

/** 数据级联数据文件名称 */
const CASCADE_DATA_FILENAMES = ["_data.json", "_data.yaml", "_data.yml", "_data.toml"];

/**
 * 加载目录级数据文件
 * @param dir 目录路径
 * @returns 解析后的数据对象
 */
export async function loadDirectoryData(dir: string): Promise<Record<string, unknown>> {
    for (const filename of CASCADE_DATA_FILENAMES) {
        const filePath = join(dir, filename);
        if (existsSync(filePath)) {
            try {
                const content = await readFile(filePath, "utf-8");
                const data = await parseDataFile(filePath, content);
                return data as Record<string, unknown>;
            } catch (error) {
                console.warn(`Failed to load cascade data file: ${filePath}`);
                console.warn((error as Error).message);
            }
        }
    }
    return {};
}

/**
 * 构建数据级联
 * 从内容路径向上遍历到 content 根目录，收集各级 _data 文件并合并
 * @param contentDir 内容根目录
 * @param contentPath 内容文件路径
 * @returns 合并后的级联数据
 */
export async function buildDataCascade(
    contentDir: string,
    contentPath: string,
): Promise<Record<string, unknown>> {
    const contentDirNormalized = contentDir.replace(/\\/g, "/");
    const contentPathNormalized = contentPath.replace(/\\/g, "/");
    
    const relativePath = relative(contentDirNormalized, dirname(contentPathNormalized));
    const pathParts = relativePath.split(/[/\\]/).filter(Boolean);
    
    const cascadeData: Record<string, unknown>[] = [];
    
    let currentDir = contentDirNormalized;
    cascadeData.push(await loadDirectoryData(currentDir));
    
    for (const part of pathParts) {
        currentDir = join(currentDir, part);
        cascadeData.push(await loadDirectoryData(currentDir));
    }
    
    let result: Record<string, unknown> = {};
    for (const data of cascadeData) {
        result = deepMerge(result, data);
    }
    
    return result;
}
