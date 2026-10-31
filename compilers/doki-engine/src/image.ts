/**
 * Doki Engine 图片资源管理模块
 *
 * 提供图片信息提取、变体生成、缓存管理和响应式图片支持。
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";

/** 支持的图片格式 */
export type ImageFormat = "jpeg" | "png" | "webp" | "gif" | "svg";

/**
 * 图片信息
 *
 * 包含图片的基本元数据信息。
 */
export interface ImageInfo {
    /** 图片路径 */
    path: string;
    /** 宽度（像素） */
    width: number;
    /** 高度（像素） */
    height: number;
    /** 图片格式 */
    format: ImageFormat;
    /** 文件大小（字节） */
    size: number;
    /** 宽高比 */
    aspectRatio: number;
}

/**
 * 图片变体
 *
 * 表示图片的某个变体版本（如不同尺寸或格式）。
 */
export interface ImageVariant {
    /** 原始图片路径 */
    originalPath: string;
    /** 变体图片路径 */
    variantPath: string;
    /** 宽度（像素） */
    width: number;
    /** 高度（像素） */
    height: number;
    /** 图片格式 */
    format: ImageFormat;
    /** 文件大小（字节） */
    size: number;
}

/**
 * 图片处理配置
 *
 * 配置图片优化和变体生成的行为。
 */
export interface ImageConfig {
    /** 是否启用优化 */
    optimize: boolean;
    /** 是否启用懒加载 */
    lazyLoading: boolean;
    /** 是否启用响应式图片 */
    responsive: boolean;
    /** 响应式尺寸列表（像素宽度） */
    sizes: number[];
    /** 输出格式列表 */
    formats: ImageFormat[];
    /** 图片质量（1-100） */
    quality: number;
}

/** 默认图片配置 */
export const DEFAULT_IMAGE_CONFIG: ImageConfig = {
    optimize: true,
    lazyLoading: true,
    responsive: true,
    sizes: [320, 640, 960, 1280],
    formats: ["webp"],
    quality: 80,
};

/**
 * 图片缓存类
 *
 * 提供图片信息和变体的内存缓存功能。
 */
export class ImageCache {
    /** 缓存存储 */
    private cache: Map<string, ImageInfo | ImageVariant>;

    /**
     * 创建图片缓存实例
     */
    constructor() {
        this.cache = new Map();
    }

    /**
     * 获取缓存项
     *
     * @param key 缓存键
     * @returns 缓存的图片信息或变体，不存在则返回 null
     */
    get(key: string): ImageInfo | ImageVariant | null {
        return this.cache.get(key) || null;
    }

    /**
     * 设置缓存项
     *
     * @param key 缓存键
     * @param value 图片信息或变体
     */
    set(key: string, value: ImageInfo | ImageVariant): void {
        this.cache.set(key, value);
    }

    /**
     * 检查缓存是否存在
     *
     * @param key 缓存键
     * @returns 是否存在缓存
     */
    has(key: string): boolean {
        return this.cache.has(key);
    }

    /**
     * 清空缓存
     */
    clear(): void {
        this.cache.clear();
    }
}

/** 全局图片缓存实例 */
export const imageCache = new ImageCache();

/**
 * 图片处理器类
 *
 * 提供图片信息提取、尺寸调整、格式转换和变体生成功能。
 */
export class ImageProcessor {
    /** 图片配置 */
    private config: ImageConfig;
    /** 缓存实例 */
    private cache: ImageCache;

    /**
     * 创建图片处理器实例
     *
     * @param config 图片处理配置
     */
    constructor(config: ImageConfig = DEFAULT_IMAGE_CONFIG) {
        this.config = { ...DEFAULT_IMAGE_CONFIG, ...config };
        this.cache = imageCache;
    }

    /**
     * 获取图片信息
     *
     * 提取图片的元数据信息，包括尺寸、格式和文件大小。
     *
     * @param path 图片路径
     * @returns 图片信息，文件不存在则返回 null
     */
    async getInfo(path: string): Promise<ImageInfo | null> {
        const cacheKey = `info:${path}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached as ImageInfo;
        }

        if (!existsSync(path)) {
            return null;
        }

        try {
            const stats = await stat(path);
            const format = getImageExtension(path) as ImageFormat;

            const info: ImageInfo = {
                path,
                width: 0,
                height: 0,
                format: format || "jpeg",
                size: stats.size,
                aspectRatio: 0,
            };

            this.cache.set(cacheKey, info);
            return info;
        } catch (error) {
            console.error(`Failed to get image info: ${path}`);
            console.error((error as Error).message);
            return null;
        }
    }

    /**
     * 调整图片尺寸
     *
     * 生成指定宽度的图片变体。
     *
     * @param path 原始图片路径
     * @param width 目标宽度
     * @param outputPath 输出路径
     * @returns 图片变体信息，处理失败则返回 null
     */
    async resize(
        path: string,
        width: number,
        outputPath: string,
    ): Promise<ImageVariant | null> {
        const cacheKey = `resize:${path}:${width}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached as ImageVariant;
        }

        if (!existsSync(path)) {
            return null;
        }

        try {
            const info = await this.getInfo(path);
            if (!info) {
                return null;
            }

            const variant: ImageVariant = {
                originalPath: path,
                variantPath: outputPath,
                width,
                height:
                    info.aspectRatio > 0
                        ? Math.round(width / info.aspectRatio)
                        : 0,
                format: info.format,
                size: 0,
            };

            this.cache.set(cacheKey, variant);
            return variant;
        } catch (error) {
            console.error(`Failed to resize image: ${path}`);
            console.error((error as Error).message);
            return null;
        }
    }

    /**
     * 转换图片格式
     *
     * 将图片转换为指定格式。
     *
     * @param path 原始图片路径
     * @param format 目标格式
     * @param outputPath 输出路径
     * @returns 图片变体信息，处理失败则返回 null
     */
    async convertFormat(
        path: string,
        format: ImageFormat,
        outputPath: string,
    ): Promise<ImageVariant | null> {
        const cacheKey = `convert:${path}:${format}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached as ImageVariant;
        }

        if (!existsSync(path)) {
            return null;
        }

        try {
            const info = await this.getInfo(path);
            if (!info) {
                return null;
            }

            const variant: ImageVariant = {
                originalPath: path,
                variantPath: outputPath,
                width: info.width,
                height: info.height,
                format,
                size: 0,
            };

            this.cache.set(cacheKey, variant);
            return variant;
        } catch (error) {
            console.error(`Failed to convert image format: ${path}`);
            console.error((error as Error).message);
            return null;
        }
    }

    /**
     * 生成图片变体
     *
     * 根据配置生成多个尺寸和格式的图片变体。
     *
     * @param path 原始图片路径
     * @param outputDir 输出目录
     * @returns 图片变体数组
     */
    async generateVariants(
        path: string,
        outputDir: string,
    ): Promise<ImageVariant[]> {
        const variants: ImageVariant[] = [];
        const info = await this.getInfo(path);

        if (!info) {
            return variants;
        }

        const baseName = basename(path, extname(path));

        if (this.config.responsive && this.config.sizes.length > 0) {
            for (const width of this.config.sizes) {
                if (info.width > 0 && width > info.width) {
                    continue;
                }

                const sizeDir = join(outputDir, `${width}w`);
                const outputPath = join(sizeDir, `${baseName}.${info.format}`);
                const variant = await this.resize(path, width, outputPath);
                if (variant) {
                    variants.push(variant);
                }
            }
        }

        if (this.config.formats.length > 0) {
            for (const format of this.config.formats) {
                if (format === info.format) {
                    continue;
                }

                const formatDir = join(outputDir, format);
                const outputPath = join(formatDir, `${baseName}.${format}`);
                const variant = await this.convertFormat(
                    path,
                    format,
                    outputPath,
                );
                if (variant) {
                    variants.push(variant);
                }
            }
        }

        return variants;
    }

    /**
     * 生成 srcset 属性值
     *
     * 根据图片变体列表生成 HTML srcset 属性值。
     *
     * @param variants 图片变体数组
     * @returns srcset 属性值字符串
     */
    generateSrcSet(variants: ImageVariant[]): string {
        return variants
            .map((variant) => `${variant.variantPath} ${variant.width}w`)
            .join(", ");
    }

    /**
     * 生成 sizes 属性值
     *
     * 根据配置生成 HTML sizes 属性值。
     *
     * @param config 配置选项
     * @returns sizes 属性值字符串
     */
    generateSizesAttribute(config: { maxWidth?: string } = {}): string {
        const { maxWidth } = config;

        if (maxWidth) {
            return `(max-width: ${maxWidth}) 100vw, ${maxWidth}`;
        }

        if (this.config.sizes.length > 0) {
            const sizes = this.config.sizes
                .map((width) => `(max-width: ${width}px) ${width}px`)
                .join(", ");
            return `${sizes}, 100vw`;
        }

        return "100vw";
    }
}

/**
 * 获取图片扩展名
 *
 * 从文件路径中提取图片扩展名（不含点号）。
 *
 * @param path 文件路径
 * @returns 小写的扩展名，不是图片则返回空字符串
 */
export function getImageExtension(path: string): string {
    const ext = extname(path).toLowerCase().slice(1);

    const extensionMap: Record<string, string> = {
        jpg: "jpeg",
        jpeg: "jpeg",
        png: "png",
        webp: "webp",
        gif: "gif",
        svg: "svg",
    };

    return extensionMap[ext] || "";
}

/**
 * 检查是否为图片文件
 *
 * 根据文件扩展名判断是否为支持的图片格式。
 *
 * @param path 文件路径
 * @returns 是否为图片文件
 */
export function isImageFile(path: string): boolean {
    const ext = getImageExtension(path);
    const supportedFormats: ImageFormat[] = [
        "jpeg",
        "png",
        "webp",
        "gif",
        "svg",
    ];
    return supportedFormats.includes(ext as ImageFormat);
}

/**
 * 生成图片哈希值
 *
 * 根据图片路径生成唯一的哈希值，用于缓存键或文件名。
 *
 * @param path 图片路径
 * @returns MD5 哈希值（16 位十六进制字符串）
 */
export function generateImageHash(path: string): string {
    return createHash("md5").update(path).digest("hex").slice(0, 16);
}

/**
 * 创建默认图片处理器
 *
 * @param config 可选的配置覆盖
 * @returns 图片处理器实例
 */
export function createImageProcessor(
    config?: Partial<ImageConfig>,
): ImageProcessor {
    return new ImageProcessor({ ...DEFAULT_IMAGE_CONFIG, ...config });
}
