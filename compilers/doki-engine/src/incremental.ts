/** 增量构建系统 */

import { readFile, writeFile, existsSync, statSync } from "fs";
import { promisify } from "util";
import { join } from "path";
import { createHash } from "crypto";

const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);

/** 增量构建清单 */
export interface BuildManifest {
    /** 构建时间戳 */
    timestamp: number;
    /** 文件记录映射 */
    files: Map<string, FileRecord>;
    /** 配置文件 hash */
    configHash: string;
}

/** 文件记录 */
export interface FileRecord {
    /** 文件路径 */
    path: string;
    /** 文件内容 hash */
    hash: string;
    /** 最后修改时间 */
    mtime: number;
    /** 依赖的模板文件 */
    templateDeps: string[];
}

/** 变更集 */
export interface ChangeSet {
    /** 新增文件 */
    added: string[];
    /** 修改文件 */
    modified: string[];
    /** 删除文件 */
    deleted: string[];
    /** 是否需要全量重建 */
    needsFullRebuild: boolean;
}

/** 增量构建管理器 */
export class IncrementalBuilder {
    /** 清单文件路径 */
    private manifestPath: string;
    /** 构建清单 */
    private manifest: BuildManifest | null = null;

    /**
     * 创建增量构建管理器实例
     * @param outputDir 输出目录
     * @param _configPath 配置文件路径（预留）
     */
    constructor(outputDir: string, _configPath: string = "doki.toml") {
        this.manifestPath = join(outputDir, ".doki-manifest.json");
    }

    /**
     * 加载构建清单
     * @returns 构建清单对象，如果不存在则返回 null
     */
    async loadManifest(): Promise<BuildManifest | null> {
        if (!existsSync(this.manifestPath)) {
            return null;
        }

        try {
            const content = await readFileAsync(this.manifestPath, "utf-8");
            const data = JSON.parse(content);

            const files = new Map<string, FileRecord>();
            if (data.files && Array.isArray(data.files)) {
                for (const [key, value] of data.files) {
                    files.set(key, value as FileRecord);
                }
            }

            this.manifest = {
                timestamp: data.timestamp || 0,
                files,
                configHash: data.configHash || "",
            };

            return this.manifest;
        } catch {
            return null;
        }
    }

    /**
     * 保存构建清单
     */
    async saveManifest(): Promise<void> {
        if (!this.manifest) {
            return;
        }

        const data = {
            timestamp: this.manifest.timestamp,
            files: Array.from(this.manifest.files.entries()),
            configHash: this.manifest.configHash,
        };

        await writeFileAsync(
            this.manifestPath,
            JSON.stringify(data, null, 2),
            "utf-8",
        );
    }

    /**
     * 计算文件 hash
     * @param filePath 文件路径
     * @returns 文件内容的 SHA256 hash
     */
    async computeFileHash(filePath: string): Promise<string> {
        try {
            const content = await readFileAsync(filePath);
            return createHash("sha256").update(content).digest("hex");
        } catch {
            return "";
        }
    }

    /**
     * 检测变更的文件
     * @param files 当前所有文件路径列表
     * @returns 变更集对象
     */
    async detectChanges(files: string[]): Promise<ChangeSet> {
        const added: string[] = [];
        const modified: string[] = [];
        const deleted: string[] = [];

        if (!this.manifest) {
            return {
                added: files,
                modified: [],
                deleted: [],
                needsFullRebuild: true,
            };
        }

        const currentFilesSet = new Set(files);
        const manifestFilesSet = new Set(this.manifest.files.keys());

        for (const file of files) {
            if (!manifestFilesSet.has(file)) {
                added.push(file);
            } else {
                const record = this.manifest.files.get(file);
                if (record) {
                    const currentHash = await this.computeFileHash(file);
                    if (currentHash !== record.hash) {
                        modified.push(file);
                    }
                }
            }
        }

        for (const file of manifestFilesSet) {
            if (!currentFilesSet.has(file)) {
                deleted.push(file);
            }
        }

        return {
            added,
            modified,
            deleted,
            needsFullRebuild: false,
        };
    }

    /**
     * 记录文件构建结果
     * @param path 文件路径
     * @param hash 文件内容 hash
     * @param templateDeps 依赖的模板文件列表
     */
    recordFile(path: string, hash: string, templateDeps: string[]): void {
        if (!this.manifest) {
            this.manifest = {
                timestamp: Date.now(),
                files: new Map(),
                configHash: "",
            };
        }

        let mtime = 0;
        try {
            const stats = statSync(path);
            mtime = stats.mtimeMs;
        } catch {
            mtime = Date.now();
        }

        this.manifest.files.set(path, {
            path,
            hash,
            mtime,
            templateDeps,
        });
    }

    /**
     * 检查是否需要全量重建
     * @param configPath 配置文件路径
     * @returns 是否需要全量重建
     */
    async needsFullRebuild(configPath: string): Promise<boolean> {
        if (!this.manifest) {
            return true;
        }

        const currentConfigHash = await this.computeFileHash(configPath);

        if (currentConfigHash !== this.manifest.configHash) {
            return true;
        }

        return false;
    }

    /**
     * 初始化清单
     * @param configHash 配置文件 hash
     */
    initManifest(configHash: string): void {
        this.manifest = {
            timestamp: Date.now(),
            files: new Map(),
            configHash,
        };
    }

    /**
     * 更新配置 hash
     * @param configHash 新的配置文件 hash
     */
    updateConfigHash(configHash: string): void {
        if (this.manifest) {
            this.manifest.configHash = configHash;
        }
    }

    /**
     * 获取当前清单
     * @returns 当前构建清单
     */
    getManifest(): BuildManifest | null {
        return this.manifest;
    }

    /**
     * 清除清单中的文件记录
     */
    clearFiles(): void {
        if (this.manifest) {
            this.manifest.files.clear();
            this.manifest.timestamp = Date.now();
        }
    }

    /**
     * 检查模板依赖是否变更
     * @param templateDir 模板目录
     * @returns 是否有模板变更
     */
    async checkTemplateChanges(templateDir: string): Promise<boolean> {
        if (!this.manifest) {
            return true;
        }

        const templateDeps = new Set<string>();
        for (const record of this.manifest.files.values()) {
            for (const dep of record.templateDeps) {
                templateDeps.add(dep);
            }
        }

        for (const templatePath of templateDeps) {
            const fullPath = join(templateDir, templatePath);
            if (existsSync(fullPath)) {
                const currentHash = await this.computeFileHash(fullPath);
                const storedRecord = Array.from(
                    this.manifest.files.values(),
                ).find((r) => r.templateDeps.includes(templatePath));

                if (storedRecord) {
                    const templateRecord = this.manifest.files.get(fullPath);
                    if (templateRecord && templateRecord.hash !== currentHash) {
                        return true;
                    }
                }
            }
        }

        return false;
    }
}
