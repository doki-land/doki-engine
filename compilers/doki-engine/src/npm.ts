/** Doki Engine NPM 包发现机制 */

import { readdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

/** 包类型 */
export type PackageType = "theme" | "plugin";

/** 发现的包信息 */
export interface DiscoveredPackage {
    /** 包名称 */
    name: string;
    /** 包版本 */
    version: string;
    /** 包类型 */
    type: PackageType;
    /** 包路径 */
    path: string;
    /** 包清单内容 */
    manifest: Record<string, unknown>;
    /** 对等依赖 */
    peerDependencies?: Record<string, string>;
}

/** 包发现选项 */
export interface DiscoverOptions {
    /** 工作目录 */
    cwd: string;
    /** 要发现的包类型，默认发现所有类型 */
    types?: PackageType[];
}

/** 版本兼容性检查结果 */
export interface VersionCompatibilityResult {
    /** 是否兼容 */
    compatible: boolean;
    /** 警告信息列表 */
    warnings: string[];
}

/** 主题包名前缀 */
const THEME_PREFIXES = ["@doki-land/theme-", "doki-theme-"];

/** 插件包名前缀 */
const PLUGIN_PREFIXES = ["@doki-land/plugin-", "doki-plugin-"];

/**
 * 解析包名，识别类型
 * @param name 包名称
 * @returns 包类型，如果无法识别则返回 null
 */
export function parsePackageName(name: string): PackageType | null {
    for (const prefix of THEME_PREFIXES) {
        if (name.startsWith(prefix)) {
            return "theme";
        }
    }

    for (const prefix of PLUGIN_PREFIXES) {
        if (name.startsWith(prefix)) {
            return "plugin";
        }
    }

    return null;
}

/**
 * 解析简写名称为完整包名
 * @param name 简写或完整名称
 * @param type 包类型
 * @returns 完整包名
 */
export function resolvePackageName(name: string, type: PackageType): string {
    if (name.startsWith("@doki-land/") || name.startsWith("doki-")) {
        return name;
    }

    if (type === "theme") {
        return `@doki-land/theme-${name}`;
    }

    return `@doki-land/plugin-${name}`;
}

/**
 * 加载包清单 (package.json)
 * @param packagePath 包路径
 * @returns 包清单对象，如果加载失败则返回 null
 */
export async function loadPackageManifest(
    packagePath: string,
): Promise<Record<string, unknown> | null> {
    const manifestPath = join(packagePath, "package.json");

    if (!existsSync(manifestPath)) {
        return null;
    }

    try {
        const content = await readFile(manifestPath, "utf-8");
        const manifest = JSON.parse(content) as Record<string, unknown>;

        if (!manifest.name || !manifest.version) {
            console.warn(
                `Package manifest missing required fields: ${manifestPath}`,
            );
            return null;
        }

        return manifest;
    } catch (error) {
        console.error(`Failed to parse package manifest: ${manifestPath}`);
        console.error((error as Error).message);
        return null;
    }
}

/**
 * 检查版本兼容性
 * @param peerDependencies 对等依赖映射
 * @param engineVersion 引擎版本
 * @returns 兼容性检查结果
 */
export function checkVersionCompatibility(
    peerDependencies: Record<string, string>,
    engineVersion: string,
): VersionCompatibilityResult {
    const warnings: string[] = [];
    let compatible = true;

    const engineDep = peerDependencies["@doki-land/doki-engine"];

    if (engineDep) {
        const satisfied = satisfiesVersion(engineVersion, engineDep);

        if (!satisfied) {
            compatible = false;
            warnings.push(
                `Package requires @doki-land/doki-engine ${engineDep}, but current version is ${engineVersion}`,
            );
        }
    }

    return { compatible, warnings };
}

/**
 * 检查版本是否满足范围要求
 * @param version 当前版本
 * @param range 版本范围
 * @returns 是否满足
 */
function satisfiesVersion(version: string, range: string): boolean {
    const cleanVersion = version.replace(/^v/, "");
    const cleanRange = range.replace(/^[\^~]/, "");

    if (range.startsWith("^")) {
        return isCompatibleMajor(cleanVersion, cleanRange);
    }

    if (range.startsWith("~")) {
        return isCompatibleMinor(cleanVersion, cleanRange);
    }

    return cleanVersion === cleanRange;
}

/**
 * 检查主版本号是否兼容
 * @param version 当前版本
 * @param target 目标版本
 * @returns 是否兼容
 */
function isCompatibleMajor(version: string, target: string): boolean {
    const versionParts = version.split(".");
    const targetParts = target.split(".");

    if (versionParts[0] !== targetParts[0]) {
        return false;
    }

    return compareVersions(version, target) >= 0;
}

/**
 * 检查次版本号是否兼容
 * @param version 当前版本
 * @param target 目标版本
 * @returns 是否兼容
 */
function isCompatibleMinor(version: string, target: string): boolean {
    const versionParts = version.split(".");
    const targetParts = target.split(".");

    if (versionParts[0] !== targetParts[0]) {
        return false;
    }

    if (versionParts[1] !== targetParts[1]) {
        return false;
    }

    return compareVersions(version, target) >= 0;
}

/**
 * 比较两个版本号
 * @param a 版本 a
 * @param b 版本 b
 * @returns a > b 返回 1，a < b 返回 -1，相等返回 0
 */
function compareVersions(a: string, b: string): number {
    const partsA = a.split(".").map((p) => parseInt(p, 10) || 0);
    const partsB = b.split(".").map((p) => parseInt(p, 10) || 0);

    const maxLen = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < maxLen; i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;

        if (numA > numB) return 1;
        if (numA < numB) return -1;
    }

    return 0;
}

/**
 * 获取包路径
 * @param packageName 包名称
 * @param cwd 工作目录
 * @returns 包路径，如果不存在则返回 null
 */
export function getPackagePath(
    packageName: string,
    cwd: string,
): string | null {
    const nodeModulesPath = join(cwd, "node_modules");

    if (packageName.startsWith("@")) {
        const scopedPath = join(nodeModulesPath, packageName);
        if (existsSync(scopedPath)) {
            return scopedPath;
        }
    }

    const normalPath = join(nodeModulesPath, packageName);
    if (existsSync(normalPath)) {
        return normalPath;
    }

    return null;
}

/**
 * 从 node_modules 发现 Doki 包
 * @param options 发现选项
 * @returns 发现的包列表
 */
export async function discoverPackages(
    options: DiscoverOptions,
): Promise<DiscoveredPackage[]> {
    const { cwd, types } = options;
    const packages: DiscoveredPackage[] = [];
    const nodeModulesPath = join(cwd, "node_modules");

    if (!existsSync(nodeModulesPath)) {
        console.warn(`node_modules not found: ${nodeModulesPath}`);
        return packages;
    }

    const targetTypes = types || ["theme", "plugin"];

    const scopedPackages = await discoverScopedPackages(
        nodeModulesPath,
        "@doki-land",
        targetTypes,
    );
    packages.push(...scopedPackages);

    const normalPackages = await discoverNormalPackages(
        nodeModulesPath,
        targetTypes,
    );
    packages.push(...normalPackages);

    return packages;
}

/**
 * 发现作用域包
 * @param nodeModulesPath node_modules 路径
 * @param scope 作用域名称
 * @param types 目标类型
 * @returns 发现的包列表
 */
async function discoverScopedPackages(
    nodeModulesPath: string,
    scope: string,
    types: PackageType[],
): Promise<DiscoveredPackage[]> {
    const packages: DiscoveredPackage[] = [];
    const scopePath = join(nodeModulesPath, scope);

    if (!existsSync(scopePath)) {
        return packages;
    }

    try {
        const entries = await readdir(scopePath, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const packageName = `${scope}/${entry.name}`;
            const packageType = parsePackageName(packageName);

            if (!packageType || !types.includes(packageType)) {
                continue;
            }

            const packagePath = join(scopePath, entry.name);
            const discovered = await createDiscoveredPackage(
                packagePath,
                packageType,
            );

            if (discovered) {
                packages.push(discovered);
            }
        }
    } catch (error) {
        console.warn(`Failed to read scoped packages: ${scopePath}`);
    }

    return packages;
}

/**
 * 发现普通包
 * @param nodeModulesPath node_modules 路径
 * @param types 目标类型
 * @returns 发现的包列表
 */
async function discoverNormalPackages(
    nodeModulesPath: string,
    types: PackageType[],
): Promise<DiscoveredPackage[]> {
    const packages: DiscoveredPackage[] = [];

    try {
        const entries = await readdir(nodeModulesPath, { withFileTypes: true });

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            if (entry.name.startsWith("@")) {
                continue;
            }

            const packageName = entry.name;
            const packageType = parsePackageName(packageName);

            if (!packageType || !types.includes(packageType)) {
                continue;
            }

            const packagePath = join(nodeModulesPath, entry.name);
            const discovered = await createDiscoveredPackage(
                packagePath,
                packageType,
            );

            if (discovered) {
                packages.push(discovered);
            }
        }
    } catch (error) {
        console.warn(`Failed to read normal packages: ${nodeModulesPath}`);
    }

    return packages;
}

/**
 * 创建发现包对象
 * @param packagePath 包路径
 * @param packageType 包类型
 * @returns 发现包对象，如果创建失败则返回 null
 */
async function createDiscoveredPackage(
    packagePath: string,
    packageType: PackageType,
): Promise<DiscoveredPackage | null> {
    const manifest = await loadPackageManifest(packagePath);

    if (!manifest) {
        return null;
    }

    const isValid = await validatePackageStructure(packagePath, packageType);

    if (!isValid) {
        return null;
    }

    return {
        name: manifest.name as string,
        version: manifest.version as string,
        type: packageType,
        path: packagePath,
        manifest,
        peerDependencies: manifest.peerDependencies as
            | Record<string, string>
            | undefined,
    };
}

/**
 * 验证包结构
 * @param packagePath 包路径
 * @param packageType 包类型
 * @returns 是否有效
 */
async function validatePackageStructure(
    packagePath: string,
    packageType: PackageType,
): Promise<boolean> {
    if (packageType === "theme") {
        const themeTomlPath = join(packagePath, "theme.toml");
        return existsSync(themeTomlPath);
    }

    if (packageType === "plugin") {
        const indexPath = join(packagePath, "index.js");
        const indexTsPath = join(packagePath, "index.ts");
        return existsSync(indexPath) || existsSync(indexTsPath);
    }

    return false;
}

/**
 * 获取包的简写名称
 * @param packageName 完整包名
 * @returns 简写名称
 */
export function getPackageShortName(packageName: string): string {
    for (const prefix of THEME_PREFIXES) {
        if (packageName.startsWith(prefix)) {
            return packageName.slice(prefix.length);
        }
    }

    for (const prefix of PLUGIN_PREFIXES) {
        if (packageName.startsWith(prefix)) {
            return packageName.slice(prefix.length);
        }
    }

    return packageName;
}

/**
 * 检查包是否为 Doki 官方包
 * @param packageName 包名称
 * @returns 是否为官方包
 */
export function isOfficialPackage(packageName: string): boolean {
    return packageName.startsWith("@doki-land/");
}
