import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** 脚手架选项 */
export interface ScaffoldOptions {
    /** 包名称 */
    name: string;
    /** 包类型 */
    type: "theme" | "plugin";
    /** 输出目录 */
    outputDir?: string;
    /** 作者 */
    author?: string;
    /** 描述 */
    description?: string;
}

/** 脚手架结果 */
export interface ScaffoldResult {
    /** 是否成功 */
    success: boolean;
    /** 创建的路径 */
    path: string;
    /** 创建的文件列表 */
    files: string[];
    /** 错误信息 */
    error?: string;
}

/** Repo-root `runtimes/` directory (same depth from `src/` and `dist/`). */
const RUNTIMES_DIR = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "runtimes",
);

/**
 * 获取模板目录路径
 * @param type 模板类型
 * @returns 模板目录路径
 */
function getTemplateDir(type: "theme" | "plugin"): string {
    return join(RUNTIMES_DIR, `${type}s`, `doki-${type}-template`);
}

/**
 * 替换文件内容中的变量
 * @param content 文件内容
 * @param variables 变量映射
 * @returns 替换后的内容
 */
function replaceVariables(
    content: string,
    variables: Record<string, string>,
): string {
    let result = content;
    for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
        result = result.replace(regex, value);
    }
    return result;
}

/**
 * 复制模板文件并替换变量
 * @param templateDir 模板目录
 * @param targetDir 目标目录
 * @param variables 变量映射
 * @returns 创建的文件列表
 */
async function copyTemplate(
    templateDir: string,
    targetDir: string,
    variables: Record<string, string>,
): Promise<string[]> {
    const createdFiles: string[] = [];

    function copyDirectory(src: string, dest: string): void {
        if (!existsSync(dest)) {
            mkdirSync(dest, { recursive: true });
        }

        const entries = readdirSync(src);
        for (const entry of entries) {
            const srcPath = join(src, entry);
            const destPath = join(dest, entry);
            const stat = statSync(srcPath);

            if (stat.isDirectory()) {
                copyDirectory(srcPath, destPath);
            } else {
                const content = readFileSync(srcPath, "utf-8");
                const processedContent = replaceVariables(content, variables);
                writeFileSync(destPath, processedContent);
                createdFiles.push(relative(targetDir, destPath));
            }
        }
    }

    copyDirectory(templateDir, targetDir);
    return createdFiles;
}

/**
 * 生成变量映射
 * @param options 脚手架选项
 * @returns 变量映射
 */
function generateVariables(options: ScaffoldOptions): Record<string, string> {
    const currentYear = new Date().getFullYear().toString();
    const fullName =
        options.type === "theme"
            ? `@doki-land/theme-${options.name}`
            : `@doki-land/plugin-${options.name}`;

    return {
        name: options.name,
        fullName,
        author: options.author || "Your Name",
        description: options.description || `A ${options.type} for Doki Engine`,
        year: currentYear,
    };
}

/**
 * 创建主题包
 * @param options 脚手架选项
 * @returns 脚手架结果
 */
export async function createTheme(
    options: ScaffoldOptions,
): Promise<ScaffoldResult> {
    return createPackage(options, "theme");
}

/**
 * 创建插件包
 * @param options 脚手架选项
 * @returns 脚手架结果
 */
export async function createPlugin(
    options: ScaffoldOptions,
): Promise<ScaffoldResult> {
    return createPackage(options, "plugin");
}

/**
 * 创建包
 * @param options 脚手架选项
 * @param type 包类型
 * @returns 脚手架结果
 */
async function createPackage(
    options: ScaffoldOptions,
    type: "theme" | "plugin",
): Promise<ScaffoldResult> {
    const outputDir = options.outputDir || process.cwd();
    const targetDir = join(outputDir, options.name);

    if (existsSync(targetDir)) {
        return {
            success: false,
            path: targetDir,
            files: [],
            error: `目录已存在: ${targetDir}`,
        };
    }

    const templateDir = getTemplateDir(type);

    if (!existsSync(templateDir)) {
        return {
            success: false,
            path: targetDir,
            files: [],
            error: `模板目录不存在: ${templateDir}`,
        };
    }

    try {
        const variables = generateVariables({ ...options, type });
        const files = await copyTemplate(templateDir, targetDir, variables);

        const processedFiles = files.map((file) => {
            const fileName = basename(file);
            if (
                fileName === "package.json" ||
                fileName === "theme.toml" ||
                fileName === "README.md"
            ) {
                return file;
            }
            return file;
        });

        return {
            success: true,
            path: targetDir,
            files: processedFiles.sort(),
        };
    } catch (error) {
        return {
            success: false,
            path: targetDir,
            files: [],
            error: (error as Error).message,
        };
    }
}
