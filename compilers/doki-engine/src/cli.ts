#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join, resolve, relative, dirname } from "path";
import { buildSite } from "./builder.js";
import { loadConfig } from "./config.js";
import { ArchetypeManager, generateSlug, formatDate } from "./archetype.js";
import {
    printCliError,
    configNotFoundError,
    templateParseError,
    printSuccess,
    printWarning,
    printErrorReportSummary,
    createErrorReport,
    directoryError,
    serverStartError,
    browserOpenError,
    type CliError,
} from "./cli-errors.js";
import { DevServer, type DevServerOptions } from "./dev-server.js";
import {
    migrate,
    getSupportedMigrators,
    type MigratorType,
    type MigrateOptions,
} from "@doki-land/doki-migrate";
import * as readline from "readline";
import {
    type DeployPlatform,
    type DeployConfigOptions,
    SUPPORTED_PLATFORMS,
    getDeployTemplate,
    generateDeployConfigContent,
    isPlatformSupported,
} from "@doki-land/doki-deploy";
import { createTheme, createPlugin, type ScaffoldOptions } from "./scaffold.js";
import { spawn } from "child_process";
import {
    resolvePackageName,
    discoverPackages,
    getPackageShortName,
} from "./npm.js";

const VERSION = "0.1.0";

/**
 * 创建包
 */
async function createPackage(
    type: "theme" | "plugin",
    name: string,
    options: { output?: string; author?: string; description?: string },
): Promise<void> {
    console.log(chalk.cyan("╭──────────────────────────────────────╮"));
    console.log(
        chalk.cyan("│") +
            chalk.bold.white("   Doki Engine 创建包                 ") +
            chalk.cyan("│"),
    );
    console.log(chalk.cyan("╰──────────────────────────────────────╯"));
    console.log();

    console.log(
        chalk.cyan(`创建${type === "theme" ? "主题" : "插件"}包: ${name}`),
    );
    console.log();

    const scaffoldOptions: ScaffoldOptions = {
        name,
        type,
        outputDir: options.output,
        author: options.author,
        description: options.description,
    };

    const result =
        type === "theme"
            ? await createTheme(scaffoldOptions)
            : await createPlugin(scaffoldOptions);

    if (result.success) {
        console.log(chalk.green("✓ 创建成功!"));
        console.log();
        console.log(chalk.white("创建的文件:"));
        for (const file of result.files) {
            console.log(chalk.gray(`  ${file}`));
        }
        console.log();
        console.log(chalk.white("下一步:"));
        console.log(chalk.gray(`  cd ${name}`));
        console.log(chalk.gray("  pnpm install"));
        console.log(chalk.gray("  pnpm build"));
    } else {
        printCliError({
            type: "io",
            title: "创建失败",
            message: result.error || "未知错误",
            suggestions: [
                { type: "fix", message: "检查目录是否已存在" },
                { type: "fix", message: "确保有写入权限" },
            ],
        });
        process.exit(1);
    }
}

/**
 * 安装主题选项
 */
interface InstallThemeOptions {
    version?: string;
    save?: boolean;
}

/**
 * 安装插件选项
 */
interface InstallPluginOptions {
    version?: string;
    save?: boolean;
}

/**
 * 执行 pnpm 命令
 */
function runPnpm(args: string[], cwd: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = spawn("pnpm", args, {
            cwd,
            stdio: "inherit",
            shell: true,
        });

        child.on("close", (code) => {
            if (code === 0) {
                resolve(code);
            } else {
                reject(new Error(`pnpm 命令执行失败，退出码: ${code}`));
            }
        });

        child.on("error", (err) => {
            reject(err);
        });
    });
}

/**
 * 更新 doki.toml 中的主题配置
 */
async function updateThemeConfig(packageName: string): Promise<void> {
    const configPath = join(process.cwd(), "doki.toml");

    if (!existsSync(configPath)) {
        return;
    }

    try {
        const content = await import("fs/promises").then((fs) =>
            fs.readFile(configPath, "utf-8"),
        );
        const shortName = getPackageShortName(packageName);

        const lines = content.split("\n");
        let inThemeSection = false;
        let themeNameUpdated = false;
        const newLines: string[] = [];

        for (const line of lines) {
            const trimmedLine = line.trim();

            if (trimmedLine.startsWith("[theme]")) {
                inThemeSection = true;
                newLines.push(line);
                continue;
            }

            if (trimmedLine.startsWith("[") && trimmedLine !== "[theme]") {
                inThemeSection = false;
            }

            if (inThemeSection && trimmedLine.startsWith("name")) {
                const indent = line.match(/^(\s*)/)?.[1] || "";
                newLines.push(`${indent}name = "${shortName}"`);
                themeNameUpdated = true;
                continue;
            }

            newLines.push(line);
        }

        if (!themeNameUpdated) {
            const themeIndex = newLines.findIndex(
                (l) => l.trim() === "[theme]",
            );
            if (themeIndex !== -1) {
                newLines.splice(themeIndex + 1, 0, `name = "${shortName}"`);
            }
        }

        const newContent = newLines.join("\n");
        writeFileSync(configPath, newContent);
    } catch (error) {
        console.warn(
            chalk.yellow("无法更新配置文件: " + (error as Error).message),
        );
    }
}

/**
 * 更新 doki.toml 中的插件配置
 */
async function updatePluginConfig(pluginNames: string[]): Promise<void> {
    const configPath = join(process.cwd(), "doki.toml");

    if (!existsSync(configPath)) {
        return;
    }

    try {
        const content = await import("fs/promises").then((fs) =>
            fs.readFile(configPath, "utf-8"),
        );
        const shortNames = pluginNames.map(getPackageShortName);

        const lines = content.split("\n");
        let inPluginSection = false;
        let pluginsUpdated = false;
        const newLines: string[] = [];

        for (const line of lines) {
            const trimmedLine = line.trim();

            if (trimmedLine.startsWith("[plugins]")) {
                inPluginSection = true;
                newLines.push(line);
                continue;
            }

            if (trimmedLine.startsWith("[") && trimmedLine !== "[plugins]") {
                inPluginSection = false;
            }

            if (inPluginSection && trimmedLine.startsWith("enabled")) {
                const indent = line.match(/^(\s*)/)?.[1] || "";
                const pluginsList = shortNames.map((n) => `"${n}"`).join(", ");
                newLines.push(`${indent}enabled = [${pluginsList}]`);
                pluginsUpdated = true;
                continue;
            }

            newLines.push(line);
        }

        if (!pluginsUpdated && shortNames.length > 0) {
            const lastLineIndex = newLines.length - 1;
            let insertIndex = lastLineIndex;

            for (let i = newLines.length - 1; i >= 0; i--) {
                if (newLines[i].trim().startsWith("[")) {
                    insertIndex = i;
                    break;
                }
            }

            const pluginsList = shortNames.map((n) => `"${n}"`).join(", ");
            newLines.splice(
                insertIndex,
                0,
                "",
                "[plugins]",
                `enabled = [${pluginsList}]`,
            );
        }

        const newContent = newLines.join("\n");
        writeFileSync(configPath, newContent);
    } catch (error) {
        console.warn(
            chalk.yellow("无法更新配置文件: " + (error as Error).message),
        );
    }
}

/**
 * 安装主题
 */
async function installTheme(
    name: string,
    options: InstallThemeOptions,
): Promise<void> {
    console.log(chalk.cyan("╭──────────────────────────────────────╮"));
    console.log(
        chalk.cyan("│") +
            chalk.bold.white("   Doki Engine 主题安装               ") +
            chalk.cyan("│"),
    );
    console.log(chalk.cyan("╰──────────────────────────────────────╯"));
    console.log();

    const fullName = resolvePackageName(name, "theme");
    const packageSpec = options.version
        ? `${fullName}@${options.version}`
        : fullName;

    console.log(chalk.white("  主题: ") + chalk.blue(packageSpec));
    console.log();

    try {
        const args = ["add", packageSpec];
        if (options.save === false) {
            args.push("--no-save");
        }

        console.log(chalk.cyan("正在安装主题..."));
        console.log();

        await runPnpm(args, process.cwd());

        await updateThemeConfig(fullName);

        console.log();
        console.log(chalk.green("✓ 主题安装成功!"));
        console.log();
        console.log(chalk.white("使用方法:"));
        console.log(chalk.gray("  在 doki.toml 中设置:"));
        console.log(chalk.cyan("  [theme]"));
        console.log(chalk.cyan(`  name = "${name}"`));
        console.log();
        console.log(chalk.cyan("下一步:"));
        console.log(
            chalk.white("  doki build      ") + chalk.gray("# 构建站点"),
        );
        console.log(
            chalk.white("  doki dev        ") + chalk.gray("# 启动开发服务器"),
        );
    } catch (error) {
        printCliError({
            type: "runtime",
            title: "主题安装失败",
            message: (error as Error).message,
            cause: error as Error,
            suggestions: [
                { type: "fix", message: "检查主题名称是否正确" },
                { type: "fix", message: "检查网络连接" },
                { type: "fix", message: "确保 pnpm 已正确安装" },
            ],
        });
        process.exit(1);
    }
}

/**
 * 列出已安装的主题
 */
async function listThemes(): Promise<void> {
    console.log(chalk.cyan("╭──────────────────────────────────────╮"));
    console.log(
        chalk.cyan("│") +
            chalk.bold.white("   Doki Engine 已安装主题             ") +
            chalk.cyan("│"),
    );
    console.log(chalk.cyan("╰──────────────────────────────────────╯"));
    console.log();

    try {
        const packages = await discoverPackages({
            cwd: process.cwd(),
            types: ["theme"],
        });

        if (packages.length === 0) {
            console.log(chalk.yellow("未发现已安装的主题"));
            console.log();
            console.log(chalk.gray("使用 doki theme install <name> 安装主题"));
            return;
        }

        console.log(chalk.cyan("已安装的主题:"));
        console.log();

        for (const pkg of packages) {
            const shortName = getPackageShortName(pkg.name);
            console.log(
                chalk.white(`  ${shortName}`) + chalk.gray(`@${pkg.version}`),
            );

            if (pkg.manifest.description) {
                console.log(chalk.gray(`    ${pkg.manifest.description}`));
            }

            if (pkg.manifest.author) {
                console.log(chalk.gray(`    作者: ${pkg.manifest.author}`));
            }
        }

        console.log();
        console.log(chalk.gray(`共 ${packages.length} 个主题`));
    } catch (error) {
        printCliError({
            type: "runtime",
            title: "获取主题列表失败",
            message: (error as Error).message,
            cause: error as Error,
        });
        process.exit(1);
    }
}

/**
 * 安装插件
 */
async function installPlugins(
    names: string[],
    options: InstallPluginOptions,
): Promise<void> {
    console.log(chalk.cyan("╭──────────────────────────────────────╮"));
    console.log(
        chalk.cyan("│") +
            chalk.bold.white("   Doki Engine 插件安装               ") +
            chalk.cyan("│"),
    );
    console.log(chalk.cyan("╰──────────────────────────────────────╯"));
    console.log();

    const fullNames = names.map((name) => resolvePackageName(name, "plugin"));
    const packageSpecs = options.version
        ? fullNames.map((name) => `${name}@${options.version}`)
        : fullNames;

    console.log(chalk.white("  插件:"));
    for (const spec of packageSpecs) {
        console.log(chalk.blue(`    - ${spec}`));
    }
    console.log();

    try {
        const args = ["add", ...packageSpecs];
        if (options.save === false) {
            args.push("--no-save");
        }

        console.log(chalk.cyan("正在安装插件..."));
        console.log();

        await runPnpm(args, process.cwd());

        await updatePluginConfig(fullNames);

        console.log();
        console.log(chalk.green("✓ 插件安装成功!"));
        console.log();
        console.log(chalk.white("使用方法:"));
        console.log(chalk.gray("  在 doki.toml 中设置:"));
        console.log(chalk.cyan("  [plugins]"));
        console.log(chalk.cyan('  enabled = ["plugin-name"]'));
        console.log();
        console.log(chalk.cyan("下一步:"));
        console.log(
            chalk.white("  doki build      ") + chalk.gray("# 构建站点"),
        );
        console.log(
            chalk.white("  doki dev        ") + chalk.gray("# 启动开发服务器"),
        );
    } catch (error) {
        printCliError({
            type: "runtime",
            title: "插件安装失败",
            message: (error as Error).message,
            cause: error as Error,
            suggestions: [
                { type: "fix", message: "检查插件名称是否正确" },
                { type: "fix", message: "检查网络连接" },
                { type: "fix", message: "确保 pnpm 已正确安装" },
            ],
        });
        process.exit(1);
    }
}

/**
 * 列出已安装的插件
 */
async function listPlugins(): Promise<void> {
    console.log(chalk.cyan("╭──────────────────────────────────────╮"));
    console.log(
        chalk.cyan("│") +
            chalk.bold.white("   Doki Engine 已安装插件             ") +
            chalk.cyan("│"),
    );
    console.log(chalk.cyan("╰──────────────────────────────────────╯"));
    console.log();

    try {
        const packages = await discoverPackages({
            cwd: process.cwd(),
            types: ["plugin"],
        });

        if (packages.length === 0) {
            console.log(chalk.yellow("未发现已安装的插件"));
            console.log();
            console.log(chalk.gray("使用 doki plugin install <name> 安装插件"));
            return;
        }

        console.log(chalk.cyan("已安装的插件:"));
        console.log();

        for (const pkg of packages) {
            const shortName = getPackageShortName(pkg.name);
            console.log(
                chalk.white(`  ${shortName}`) + chalk.gray(`@${pkg.version}`),
            );

            if (pkg.manifest.description) {
                console.log(chalk.gray(`    ${pkg.manifest.description}`));
            }

            if (pkg.manifest.author) {
                console.log(chalk.gray(`    作者: ${pkg.manifest.author}`));
            }
        }

        console.log();
        console.log(chalk.gray(`共 ${packages.length} 个插件`));
    } catch (error) {
        printCliError({
            type: "runtime",
            title: "获取插件列表失败",
            message: (error as Error).message,
            cause: error as Error,
        });
        process.exit(1);
    }
}

/**
 * 异步询问用户确认
 */
async function askConfirm(question: string): Promise<boolean> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            const normalized = answer.toLowerCase().trim();
            resolve(
                normalized === "y" ||
                    normalized === "yes" ||
                    normalized === "是",
            );
        });
    });
}

/**
 * 生成部署配置文件
 */
async function generateDeployConfig(
    platform: DeployPlatform,
    targetDir: string,
    force: boolean,
    outputDir: string,
    nodeVersion: string,
): Promise<{ success: boolean; skipped: boolean; message: string }> {
    const template = getDeployTemplate(platform);
    const outputPath = join(targetDir, template.outputFile);

    if (existsSync(outputPath)) {
        if (!force) {
            const shouldOverwrite = await askConfirm(
                chalk.yellow(
                    `  文件 ${template.outputFile} 已存在，是否覆盖？(y/N) `,
                ),
            );
            if (!shouldOverwrite) {
                return {
                    success: true,
                    skipped: true,
                    message: `跳过: ${template.outputFile}`,
                };
            }
        }
    }

    const outputDirPath = dirname(outputPath);
    if (!existsSync(outputDirPath)) {
        try {
            mkdirSync(outputDirPath, { recursive: true });
        } catch (error) {
            return {
                success: false,
                skipped: false,
                message: `无法创建目录 ${outputDirPath}: ${(error as Error).message}`,
            };
        }
    }

    try {
        const configOptions: DeployConfigOptions = {
            platform,
            outputDir,
            nodeVersion,
        };
        const content = generateDeployConfigContent(configOptions);
        writeFileSync(outputPath, content);
        return {
            success: true,
            skipped: false,
            message: `创建 ${template.description}: ${chalk.blue(template.outputFile)}`,
        };
    } catch (error) {
        return {
            success: false,
            skipped: false,
            message: `无法创建文件 ${template.outputFile}: ${(error as Error).message}`,
        };
    }
}

const program = new Command();

program
    .name("doki")
    .description(
        "Doki Engine - 静态站点生成器\n\n基于 DejaVu 模板引擎的现代化静态站点生成工具",
    )
    .version(VERSION, "-v, --version", "显示版本号")
    .helpOption("-h, --help", "显示帮助信息")
    .addHelpText(
        "after",
        `
示例:
  $ doki init                    在当前目录初始化新项目
  $ doki dev                     启动开发服务器 (支持 HMR)
  $ doki build                   构建站点
  $ doki preview                 预览已构建的站点
  $ doki create theme my-theme   创建主题包
  $ doki create plugin my-plugin 创建插件包

文档: https://github.com/doki-land/doki-engine
`,
    );

program
    .command("init")
    .description("初始化一个新的 Doki Engine 项目")
    .argument("[path]", "项目路径", ".")
    .option("-f, --force", "强制覆盖已存在的文件", false)
    .option("--template <name>", "使用指定模板初始化", "default")
    .addHelpText(
        "after",
        `
示例:
  $ doki init                    在当前目录初始化
  $ doki init my-site            在 my-site 目录初始化
  $ doki init --force            强制覆盖已存在的文件
`,
    )
    .action((path, options) => {
        const targetDir = path === "." ? process.cwd() : resolve(path);
        const relativeDir = relative(process.cwd(), targetDir) || ".";

        console.log(chalk.cyan("╭──────────────────────────────────────╮"));
        console.log(
            chalk.cyan("│") +
                chalk.bold.white("   Doki Engine 项目初始化              ") +
                chalk.cyan("│"),
        );
        console.log(chalk.cyan("╰──────────────────────────────────────╯"));
        console.log();

        try {
            if (path !== "." && !existsSync(targetDir)) {
                try {
                    mkdirSync(targetDir, { recursive: true });
                    console.log(
                        chalk.green("✓") +
                            ` 创建项目目录: ${chalk.blue(relativeDir)}`,
                    );
                } catch (error) {
                    printCliError(
                        directoryError(targetDir, (error as Error).message),
                    );
                    process.exit(1);
                }
            }

            const directories = ["content", "static/css", "templates"];

            for (const dir of directories) {
                const fullPath = join(targetDir, dir);
                if (!existsSync(fullPath)) {
                    try {
                        mkdirSync(fullPath, { recursive: true });
                        console.log(
                            chalk.green("✓") + ` 创建目录: ${chalk.blue(dir)}`,
                        );
                    } catch (error) {
                        printCliError(
                            directoryError(fullPath, (error as Error).message),
                        );
                        process.exit(1);
                    }
                } else if (!options.force) {
                    console.log(
                        chalk.yellow("○") + ` 目录已存在: ${chalk.blue(dir)}`,
                    );
                }
            }

            const configPath = join(targetDir, "doki.toml");
            if (existsSync(configPath) && !options.force) {
                console.log(
                    chalk.yellow("○") +
                        ` 配置文件已存在: ${chalk.blue("doki.toml")}`,
                );
            } else {
                const configContent = `# Doki Engine 配置文件
# 文档: https://github.com/doki-land/doki-engine

[site]
title = "My Doki Site"
description = "A static site generated by Doki Engine"
lang = "zh-CN"
author = "Author"

[build]
input_dir = "content"
output_dir = "dist"
static_dir = "static"
incremental = false

[theme]
name = "default"

[template]
engine = "doki"
dir = "templates"
layout = "layout"
`;
                try {
                    writeFileSync(configPath, configContent);
                    console.log(
                        chalk.green("✓") +
                            ` 创建配置文件: ${chalk.blue("doki.toml")}`,
                    );
                } catch (error) {
                    printCliError({
                        type: "io",
                        title: "无法创建配置文件",
                        message: (error as Error).message,
                        filePath: configPath,
                        suggestions: [
                            { type: "fix", message: "检查文件写入权限" },
                            { type: "fix", message: "确保磁盘空间充足" },
                        ],
                    });
                    process.exit(1);
                }
            }

            const packageJsonPath = join(targetDir, "package.json");
            if (existsSync(packageJsonPath) && !options.force) {
                console.log(
                    chalk.yellow("○") +
                        ` package.json 已存在: ${chalk.blue("package.json")}`,
                );
            } else {
                const packageJsonContent = {
                    name: "my-doki-site",
                    version: "1.0.0",
                    private: true,
                    scripts: {
                        build: "doki build",
                        dev: "doki dev",
                        preview: "doki preview",
                    },
                    dependencies: {
                        "@doki-land/doki-engine": "^1.0.0",
                    },
                    doki: {
                        theme: "default",
                    },
                };
                try {
                    writeFileSync(
                        packageJsonPath,
                        JSON.stringify(packageJsonContent, null, 2) + "\n",
                    );
                    console.log(
                        chalk.green("✓") +
                            ` 创建 package.json: ${chalk.blue("package.json")}`,
                    );
                } catch (error) {
                    printCliError({
                        type: "io",
                        title: "无法创建 package.json",
                        message: (error as Error).message,
                        filePath: packageJsonPath,
                        suggestions: [
                            { type: "fix", message: "检查文件写入权限" },
                            { type: "fix", message: "确保磁盘空间充足" },
                        ],
                    });
                }
            }

            const layoutPath = join(targetDir, "templates/layout.html");
            if (existsSync(layoutPath) && !options.force) {
                console.log(
                    chalk.yellow("○") +
                        ` 模板已存在: ${chalk.blue("templates/layout.html")}`,
                );
            } else {
                const layoutTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{% site.title %}</title>
  <link rel="stylesheet" href="/static/css/style.css">
</head>
<body>
  <header>
    <h1>{% site.title %}</h1>
  </header>
  <main>
    {% content %}
  </main>
  <footer>
    <p>Generated by Doki Engine</p>
  </footer>
</body>
</html>`;
                try {
                    writeFileSync(layoutPath, layoutTemplate);
                    console.log(
                        chalk.green("✓") +
                            ` 创建模板: ${chalk.blue("templates/layout.html")}`,
                    );
                } catch (error) {
                    printCliError({
                        type: "io",
                        title: "无法创建模板文件",
                        message: (error as Error).message,
                        filePath: layoutPath,
                    });
                }
            }

            const indexPath = join(targetDir, "content/index.md");
            if (existsSync(indexPath) && !options.force) {
                console.log(
                    chalk.yellow("○") +
                        ` 内容已存在: ${chalk.blue("content/index.md")}`,
                );
            } else {
                const indexContent = `---
title: "Home"
date: "2024-01-01"
description: "Welcome to my site"
---

# Welcome to Doki Engine

This is a static site generated by Doki Engine.

## Features

- Markdown support
- Template system
- Static file handling
`;
                try {
                    writeFileSync(indexPath, indexContent);
                    console.log(
                        chalk.green("✓") +
                            ` 创建内容: ${chalk.blue("content/index.md")}`,
                    );
                } catch (error) {
                    printCliError({
                        type: "io",
                        title: "无法创建内容文件",
                        message: (error as Error).message,
                        filePath: indexPath,
                    });
                }
            }

            const stylePath = join(targetDir, "static/css/style.css");
            if (existsSync(stylePath) && !options.force) {
                console.log(
                    chalk.yellow("○") +
                        ` 样式已存在: ${chalk.blue("static/css/style.css")}`,
                );
            } else {
                const styleContent = `body {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  margin: 0;
  padding: 0;
  background-color: #f4f4f4;
}

header {
  background-color: #333;
  color: white;
  padding: 1rem;
  text-align: center;
}

main {
  padding: 2rem;
  max-width: 800px;
  margin: 0 auto;
  background-color: white;
}

footer {
  background-color: #333;
  color: white;
  text-align: center;
  padding: 1rem;
  margin-top: 2rem;
}
`;
                try {
                    writeFileSync(stylePath, styleContent);
                    console.log(
                        chalk.green("✓") +
                            ` 创建样式: ${chalk.blue("static/css/style.css")}`,
                    );
                } catch (error) {
                    printCliError({
                        type: "io",
                        title: "无法创建样式文件",
                        message: (error as Error).message,
                        filePath: stylePath,
                    });
                }
            }

            console.log();
            console.log(chalk.green("✓ 项目初始化完成!"));
            console.log();
            console.log(chalk.cyan("下一步:"));
            if (path !== ".") {
                console.log(chalk.white(`  cd ${relativeDir}`));
            }
            console.log(
                chalk.white("  doki build      ") + chalk.gray("# 构建站点"),
            );
            console.log(
                chalk.white("  doki preview    ") +
                    chalk.gray("# 启动预览服务器"),
            );
        } catch (error) {
            printCliError({
                type: "runtime",
                title: "初始化失败",
                message: (error as Error).message,
                cause: error as Error,
                suggestions: [
                    { type: "fix", message: "检查目标目录权限" },
                    { type: "fix", message: "确保磁盘空间充足" },
                ],
            });
            process.exit(1);
        }
    });

program
    .command("build")
    .description("构建静态站点")
    .option("-c, --config <path>", "配置文件路径", "doki.toml")
    .option("-o, --output <path>", "输出目录路径")
    .option("--drafts", "包含草稿内容", false)
    .option("--clean", "构建前清空输出目录", false)
    .option("--full", "强制全量构建", false)
    .addHelpText(
        "after",
        `
示例:
  $ doki build                   使用默认配置构建
  $ doki build --drafts          包含草稿内容
  $ doki build -c my.toml        使用指定配置文件
  $ doki build -o ./public       输出到指定目录
  $ doki build --full            强制全量构建（忽略增量构建）
`,
    )
    .action(async (options) => {
        console.log(chalk.cyan("╭──────────────────────────────────────╮"));
        console.log(
            chalk.cyan("│") +
                chalk.bold.white("   Doki Engine 构建站点               ") +
                chalk.cyan("│"),
        );
        console.log(chalk.cyan("╰──────────────────────────────────────╯"));
        console.log();

        try {
            if (!existsSync(options.config)) {
                printCliError(configNotFoundError(options.config));
                process.exit(1);
            }

            const startTime = Date.now();

            const result = await buildSite({
                configPath: options.config,
                includeDrafts: options.drafts,
                clean: options.clean,
                full: options.full,
            });

            const elapsed = Date.now() - startTime;

            console.log();

            if (result.success) {
                printSuccess("构建完成!");
                console.log();
                console.log(
                    chalk.white("  处理文件: ") +
                        chalk.blue(result.contentCount + " 个"),
                );
                console.log(
                    chalk.white("  输出目录: ") + chalk.blue(result.outputDir),
                );
                console.log(
                    chalk.white("  构建耗时: ") + chalk.blue(elapsed + "ms"),
                );
                console.log();
                console.log(
                    chalk.cyan("提示: 运行 ") +
                        chalk.white("doki preview") +
                        chalk.cyan(" 预览站点"),
                );
            } else {
                if (
                    "detailedErrors" in result &&
                    result.detailedErrors &&
                    result.detailedErrors.length > 0
                ) {
                    for (const err of result.detailedErrors) {
                        printCliError(err);
                    }
                } else {
                    const errors: CliError[] = result.errors.map((msg) => ({
                        type: "build" as const,
                        title: "构建错误",
                        message: msg,
                    }));
                    const report = createErrorReport(errors);
                    printErrorReportSummary(report);
                }
                process.exit(1);
            }
        } catch (error) {
            const err = error as Error;
            if ("structured" in err) {
                printCliError(templateParseError(options.config, err));
            } else {
                printCliError({
                    type: "build",
                    title: "构建错误",
                    message: err.message,
                    cause: err,
                    suggestions: [
                        { type: "fix", message: "检查配置文件是否正确" },
                        {
                            type: "fix",
                            message: "检查模板文件是否存在语法错误",
                        },
                    ],
                });
            }
            process.exit(1);
        }
    });

program
    .command("dev")
    .description("启动开发服务器，支持热重载和文件监视")
    .option("-p, --port <port>", "服务器端口", "3000")
    .option("--no-open", "不自动打开浏览器")
    .option("-c, --config <path>", "配置文件路径", "doki.toml")
    .addHelpText(
        "after",
        `
示例:
  $ doki dev                     启动开发服务器
  $ doki dev -p 8080             在端口 8080 启动
  $ doki dev --no-open           不自动打开浏览器

功能:
  - 文件变更自动重新构建
  - 浏览器自动刷新 (HMR)
  - 构建错误在浏览器中显示
`,
    )
    .action(async (options) => {
        console.log(chalk.cyan("╭──────────────────────────────────────╮"));
        console.log(
            chalk.cyan("│") +
                chalk.bold.white("   Doki Engine 开发模式               ") +
                chalk.cyan("│"),
        );
        console.log(chalk.cyan("╰──────────────────────────────────────╯"));
        console.log();

        try {
            if (!existsSync(options.config)) {
                printCliError(configNotFoundError(options.config));
                process.exit(1);
            }

            const config = await loadConfig(options.config);

            console.log(
                chalk.white("  站点: ") + chalk.blue(config.site.title),
            );
            console.log(
                chalk.white("  内容: ") + chalk.blue(config.build.inputDir),
            );
            console.log(
                chalk.white("  模板: ") + chalk.blue(config.template.dir),
            );
            console.log();

            console.log(chalk.cyan("首次构建中..."));
            const initialResult = await buildSite({
                configPath: options.config,
            });

            if (!initialResult.success) {
                printWarning("初始构建失败，但开发服务器仍将启动");
                for (const error of initialResult.errors) {
                    console.log(chalk.red(`  - ${error}`));
                }
            } else {
                printSuccess(
                    `初始构建完成 (${initialResult.contentCount} 个文件)`,
                );
            }
            console.log();

            const devServerOptions: DevServerOptions = {
                port: parseInt(options.port, 10),
                outputDir: config.build.outputDir,
                staticDir: config.build.staticDir,
                contentDir: config.build.inputDir,
                templateDir: config.template.dir,
                dataDir: config.build.dataDir || config.data?.dir || "data",
                configPath: options.config,
                open: options.open,
                onBuild: async (_filePath?: string) => {
                    const result = await buildSite({
                        configPath: options.config,
                    });
                    return {
                        success: result.success,
                        errors: result.errors,
                    };
                },
            };

            const devServer = new DevServer(devServerOptions);

            try {
                await devServer.start();
            } catch (error) {
                const err = error as Error;
                if (err.message.includes("EADDRINUSE")) {
                    printCliError({
                        type: "runtime",
                        title: "端口占用",
                        message: `端口 ${options.port} 已被占用`,
                        suggestions: [
                            {
                                type: "command",
                                message: "使用其他端口",
                                command: `doki dev -p ${parseInt(options.port) + 1}`,
                            },
                            {
                                type: "fix",
                                message: `查找并关闭占用端口 ${options.port} 的进程`,
                            },
                        ],
                    });
                } else {
                    printCliError(serverStartError(err.message));
                }
                process.exit(1);
            }

            printSuccess("开发服务器已启动");
            console.log();
            console.log(
                chalk.white("  本地地址: ") +
                    chalk.blue(`http://localhost:${options.port}`),
            );
            console.log(
                chalk.white("  HMR 端点: ") +
                    chalk.blue(`ws://localhost:${options.port}/__hmr`),
            );
            console.log();
            console.log(chalk.gray("  监视文件变更中..."));
            console.log(chalk.gray("  按 Ctrl+C 停止服务器"));
            console.log();

            if (options.open) {
                const opn = (await import("opn")).default;
                opn(`http://localhost:${options.port}`).catch((err: Error) => {
                    printCliError(browserOpenError(err.message));
                });
            }

            process.on("SIGINT", async () => {
                console.log();
                printWarning("正在关闭服务器...");
                await devServer.stop();
                printSuccess("服务器已停止");
                process.exit(0);
            });
        } catch (error) {
            printCliError({
                type: "runtime",
                title: "启动开发服务器失败",
                message: (error as Error).message,
                cause: error as Error,
                suggestions: [
                    { type: "fix", message: "检查配置文件是否正确" },
                    { type: "fix", message: "检查端口是否被占用" },
                    { type: "fix", message: "确保所有依赖已安装" },
                ],
            });
            process.exit(1);
        }
    });

program
    .command("preview")
    .description("预览已构建的站点（静态文件服务器）")
    .option("-p, --port <port>", "服务器端口", "3000")
    .option("--no-open", "不自动打开浏览器")
    .addHelpText(
        "after",
        `
示例:
  $ doki preview                 在默认端口 3000 启动
  $ doki preview -p 8080         在端口 8080 启动

注意: 此命令仅用于预览已构建的站点，不会监视文件变更。
如需开发模式，请使用 'doki dev' 命令。
`,
    )
    .action(async (options) => {
        console.log(chalk.cyan("╭──────────────────────────────────────╮"));
        console.log(
            chalk.cyan("│") +
                chalk.bold.white("   Doki Engine 预览服务器             ") +
                chalk.cyan("│"),
        );
        console.log(chalk.cyan("╰──────────────────────────────────────╯"));
        console.log();

        try {
            if (!existsSync("doki.toml")) {
                printCliError(configNotFoundError("doki.toml"));
                process.exit(1);
            }

            const config = await loadConfig("doki.toml");

            if (!existsSync(config.build.outputDir)) {
                printCliError({
                    type: "io",
                    title: "输出目录未找到",
                    message: `输出目录 ${config.build.outputDir} 不存在`,
                    filePath: config.build.outputDir,
                    suggestions: [
                        {
                            type: "command",
                            message: "先构建站点",
                            command: "doki build",
                        },
                        {
                            type: "fix",
                            message: "检查配置文件中的 output_dir 设置",
                        },
                    ],
                });
                process.exit(1);
            }

            const express = await import("express");
            const opn = (await import("opn")).default;

            const app = express.default();
            const port = parseInt(options.port, 10);

            app.use(express.static(config.build.outputDir));
            app.use("/static", express.static(config.build.staticDir));

            app.get("*", (_req, res) => {
                const indexPath = join(
                    process.cwd(),
                    config.build.outputDir,
                    "index.html",
                );
                if (existsSync(indexPath)) {
                    res.sendFile(indexPath);
                } else {
                    res.status(404).send("Not Found");
                }
            });

            const server = app.listen(port, () => {
                printSuccess("预览服务器已启动");
                console.log();
                console.log(
                    chalk.white("  本地地址: ") +
                        chalk.blue(`http://localhost:${port}`),
                );
                console.log(
                    chalk.white("  输出目录: ") +
                        chalk.blue(config.build.outputDir),
                );
                console.log();
                console.log(chalk.gray("  按 Ctrl+C 停止服务器"));
                console.log();

                if (options.open) {
                    opn(`http://localhost:${port}`).catch((err: Error) => {
                        printCliError(browserOpenError(err.message));
                    });
                }
            });

            server.on("error", (err: Error & { code?: string }) => {
                if (err.code === "EADDRINUSE") {
                    printCliError({
                        type: "runtime",
                        title: "端口占用",
                        message: `端口 ${port} 已被占用`,
                        suggestions: [
                            {
                                type: "command",
                                message: "使用其他端口",
                                command: `doki preview -p ${port + 1}`,
                            },
                            {
                                type: "fix",
                                message: `查找并关闭占用端口 ${port} 的进程`,
                            },
                        ],
                    });
                } else {
                    printCliError(serverStartError(err.message));
                }
                process.exit(1);
            });

            process.on("SIGINT", () => {
                console.log();
                printWarning("正在关闭服务器...");
                server.close(() => {
                    printSuccess("服务器已停止");
                    process.exit(0);
                });
            });
        } catch (error) {
            printCliError({
                type: "runtime",
                title: "启动服务器失败",
                message: (error as Error).message,
                cause: error as Error,
            });
            process.exit(1);
        }
    });

program
    .command("check")
    .description("检查项目配置和模板语法")
    .option("-c, --config <path>", "配置文件路径", "doki.toml")
    .action(async (options) => {
        console.log(chalk.cyan("╭──────────────────────────────────────╮"));
        console.log(
            chalk.cyan("│") +
                chalk.bold.white("   Doki Engine 项目检查               ") +
                chalk.cyan("│"),
        );
        console.log(chalk.cyan("╰──────────────────────────────────────╯"));
        console.log();

        let hasErrors = false;

        try {
            if (!existsSync(options.config)) {
                printCliError(configNotFoundError(options.config));
                hasErrors = true;
            } else {
                printSuccess("配置文件: " + chalk.blue(options.config));

                const config = await loadConfig(options.config);
                printSuccess("站点标题: " + chalk.blue(config.site.title));
                printSuccess("输入目录: " + chalk.blue(config.build.inputDir));
                printSuccess("输出目录: " + chalk.blue(config.build.outputDir));

                if (!existsSync(config.build.inputDir)) {
                    printCliError({
                        type: "config",
                        title: "输入目录不存在",
                        message: `输入目录 ${config.build.inputDir} 不存在`,
                        filePath: config.build.inputDir,
                        suggestions: [
                            { type: "fix", message: "创建内容目录" },
                            {
                                type: "command",
                                message: "初始化项目结构",
                                command: "doki init",
                            },
                        ],
                    });
                    hasErrors = true;
                } else {
                    printSuccess("输入目录存在");
                }

                if (!existsSync(config.template.dir)) {
                    printCliError({
                        type: "config",
                        title: "模板目录不存在",
                        message: `模板目录 ${config.template.dir} 不存在`,
                        filePath: config.template.dir,
                        suggestions: [
                            { type: "fix", message: "创建模板目录" },
                            {
                                type: "fix",
                                message: "检查配置文件中的 template.dir 设置",
                            },
                        ],
                    });
                    hasErrors = true;
                } else {
                    printSuccess("模板目录存在");
                }

                if (!existsSync(config.build.staticDir)) {
                    printWarning(
                        "静态文件目录不存在: " +
                            chalk.blue(config.build.staticDir),
                    );
                } else {
                    printSuccess("静态文件目录存在");
                }
            }

            console.log();

            if (hasErrors) {
                printWarning("检查发现问题，请修复后重试");
                process.exit(1);
            } else {
                printSuccess("项目检查通过");
            }
        } catch (error) {
            printCliError({
                type: "config",
                title: "检查失败",
                message: (error as Error).message,
                cause: error as Error,
            });
            process.exit(1);
        }
    });

program
    .command("clean")
    .description("清空输出目录")
    .option("-c, --config <path>", "配置文件路径", "doki.toml")
    .option("-f, --force", "强制清空，不询问确认", false)
    .action(async (options) => {
        try {
            if (!existsSync(options.config)) {
                printCliError(configNotFoundError(options.config));
                process.exit(1);
            }

            const config = await loadConfig(options.config);
            const outputDir = config.build.outputDir;

            if (!existsSync(outputDir)) {
                printWarning("输出目录不存在，无需清理");
                return;
            }

            if (!options.force) {
                printWarning("即将删除目录: " + chalk.blue(outputDir));
                console.log(chalk.yellow("使用 --force 参数跳过确认"));
                return;
            }

            try {
                rmSync(outputDir, { recursive: true });
                printSuccess("已清空输出目录: " + chalk.blue(outputDir));
            } catch (error) {
                printCliError({
                    type: "io",
                    title: "清空失败",
                    message: (error as Error).message,
                    filePath: outputDir,
                    suggestions: [
                        { type: "fix", message: "检查目录权限" },
                        { type: "fix", message: "确保没有其他进程占用目录" },
                    ],
                });
                process.exit(1);
            }
        } catch (error) {
            printCliError({
                type: "config",
                title: "清空失败",
                message: (error as Error).message,
                cause: error as Error,
            });
            process.exit(1);
        }
    });

const deployCommand = program.command("deploy").description("部署配置管理");

deployCommand
    .command("init")
    .description("初始化部署配置文件")
    .argument("[platform]", "部署平台 (netlify|vercel|github)")
    .option("-a, --all", "生成所有平台的配置文件", false)
    .option("-f, --force", "强制覆盖已存在的文件", false)
    .option("-c, --config <path>", "配置文件路径", "doki.toml")
    .option("--node-version <version>", "Node.js 版本", "20")
    .addHelpText(
        "after",
        `
支持的平台:
  netlify     Netlify 配置 (netlify.toml)
  vercel      Vercel 配置 (vercel.json)
  github      GitHub Pages 工作流 (.github/workflows/deploy.yml)

示例:
  $ doki deploy init netlify    生成 Netlify 配置
  $ doki deploy init --all      生成所有平台配置
  $ doki deploy init vercel -f  强制覆盖已存在文件
`,
    )
    .action(async (platform, options) => {
        console.log(chalk.cyan("╭──────────────────────────────────────╮"));
        console.log(
            chalk.cyan("│") +
                chalk.bold.white("   Doki Engine 部署配置生成           ") +
                chalk.cyan("│"),
        );
        console.log(chalk.cyan("╰──────────────────────────────────────╯"));
        console.log();

        if (!options.all && !platform) {
            printCliError({
                type: "config",
                title: "缺少参数",
                message: "请指定部署平台或使用 --all 生成所有配置",
                suggestions: [
                    {
                        type: "command",
                        message: "生成 Netlify 配置",
                        command: "doki deploy init netlify",
                    },
                    {
                        type: "command",
                        message: "生成 Vercel 配置",
                        command: "doki deploy init vercel",
                    },
                    {
                        type: "command",
                        message: "生成 GitHub Pages 配置",
                        command: "doki deploy init github",
                    },
                    {
                        type: "command",
                        message: "生成所有配置",
                        command: "doki deploy init --all",
                    },
                ],
            });
            process.exit(1);
        }

        if (platform && !isPlatformSupported(platform)) {
            printCliError({
                type: "config",
                title: "无效的平台",
                message: `不支持的平台: ${platform}`,
                suggestions: SUPPORTED_PLATFORMS.map((p) => ({
                    type: "command" as const,
                    message: `生成 ${getDeployTemplate(p).name} 配置`,
                    command: `doki deploy init ${p}`,
                })),
            });
            process.exit(1);
        }

        let outputDir = "dist";
        try {
            if (existsSync(options.config)) {
                const config = await loadConfig(options.config);
                outputDir = config.build.outputDir;
            }
        } catch {
            // 使用默认值
        }

        const targetDir = process.cwd();
        const platformsToGenerate: DeployPlatform[] = options.all
            ? SUPPORTED_PLATFORMS
            : [platform as DeployPlatform];

        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        for (const p of platformsToGenerate) {
            const template = getDeployTemplate(p);
            console.log(chalk.white(`\n正在生成 ${template.name} 配置...`));

            const result = await generateDeployConfig(
                p,
                targetDir,
                options.force,
                outputDir,
                options.nodeVersion,
            );

            if (result.success) {
                if (result.skipped) {
                    console.log(chalk.yellow("○ ") + result.message);
                    skipCount++;
                } else {
                    console.log(chalk.green("✓ ") + result.message);
                    successCount++;
                }
            } else {
                console.log(chalk.red("✗ ") + result.message);
                errorCount++;
            }
        }

        console.log();
        console.log(chalk.gray("─".repeat(40)));
        console.log(
            chalk.white("  生成完成: ") +
                chalk.green(`${successCount} 个文件`) +
                (skipCount > 0 ? chalk.yellow(`，跳过 ${skipCount} 个`) : "") +
                (errorCount > 0 ? chalk.red(`，失败 ${errorCount} 个`) : ""),
        );
        console.log();

        if (errorCount > 0) {
            process.exit(1);
        }

        if (successCount > 0) {
            console.log(chalk.cyan("下一步:"));
            console.log(chalk.white("  1. 检查生成的配置文件"));
            console.log(chalk.white("  2. 根据需要修改配置"));
            console.log(chalk.white("  3. 推送到 Git 仓库并部署"));
            console.log();
        }
    });

program
    .command("new")
    .description("创建新内容")
    .argument("<type>", "内容类型 (post, page)")
    .argument("<title>", "内容标题")
    .option("-c, --config <path>", "配置文件路径", "doki.toml")
    .option("--layout <name>", "指定布局模板")
    .option("--date <date>", "指定日期 (YYYY-MM-DD)")
    .option("--draft", "创建为草稿", false)
    .option("--path <path>", "自定义内容路径")
    .addHelpText(
        "after",
        `
示例:
  $ doki new post "我的第一篇文章"     创建新文章
  $ doki new page "关于我"            创建新页面
  $ doki new post "新文章" --draft    创建草稿文章
  $ doki new post "新文章" --date 2024-01-01  指定日期

内容类型:
  post    文章类型，保存到 content/posts/YYYY-MM-DD-slug.md
  page    页面类型，保存到 content/slug/index.md

Archetypes:
  如果存在 archetypes/post.md 或 archetypes/page.md，将作为模板使用
`,
    )
    .action(async (type, title, options) => {
        console.log(chalk.cyan("╭──────────────────────────────────────╮"));
        console.log(
            chalk.cyan("│") +
                chalk.bold.white("   Doki Engine 创建内容               ") +
                chalk.cyan("│"),
        );
        console.log(chalk.cyan("╰──────────────────────────────────────╯"));
        console.log();

        const validTypes = ["post", "page"];
        if (!validTypes.includes(type)) {
            printCliError({
                type: "config",
                title: "无效的内容类型",
                message: `不支持的内容类型: ${type}`,
                suggestions: [
                    {
                        type: "command",
                        message: "创建文章",
                        command: `doki new post "${title}"`,
                    },
                    {
                        type: "command",
                        message: "创建页面",
                        command: `doki new page "${title}"`,
                    },
                ],
            });
            process.exit(1);
        }

        try {
            if (!existsSync(options.config)) {
                printCliError(configNotFoundError(options.config));
                process.exit(1);
            }

            const config = await loadConfig(options.config);
            const contentDir = config.build.inputDir;
            const archetypesDir = join(process.cwd(), "archetypes");

            const archetypeManager = new ArchetypeManager(archetypesDir);
            const archetype = await archetypeManager.getArchetype(type);

            const slug = generateSlug(title);
            const date = options.date || formatDate(new Date());

            console.log(chalk.white("  类型: ") + chalk.blue(type));
            console.log(chalk.white("  标题: ") + chalk.blue(title));
            console.log(chalk.white("  Slug: ") + chalk.blue(slug));
            console.log(chalk.white("  日期: ") + chalk.blue(date));
            if (options.draft) {
                console.log(chalk.white("  状态: ") + chalk.yellow("草稿"));
            }
            if (options.layout) {
                console.log(
                    chalk.white("  布局: ") + chalk.blue(options.layout),
                );
            }
            if (archetype) {
                console.log(
                    chalk.white("  模板: ") +
                        chalk.blue(`archetypes/${type}.md`),
                );
            }
            console.log();

            const result = await archetypeManager.createContent({
                type,
                title,
                layout: options.layout,
                date,
                draft: options.draft,
                customPath: options.path,
                archetype: archetype ?? undefined,
                contentDir,
            });

            if (result.success) {
                const relativePath = relative(process.cwd(), result.filePath!);
                printSuccess("内容创建成功");
                console.log();
                console.log(chalk.white("  文件: ") + chalk.blue(relativePath));
                console.log();
                console.log(chalk.cyan("下一步:"));
                console.log(chalk.white(`  编辑文件: ${relativePath}`));
                console.log(chalk.white("  启动开发服务器: doki dev"));
            } else {
                printCliError({
                    type: "io",
                    title: "创建内容失败",
                    message: result.error || "未知错误",
                    suggestions: [
                        { type: "fix", message: "检查文件路径是否正确" },
                        { type: "fix", message: "确保有写入权限" },
                    ],
                });
                process.exit(1);
            }
        } catch (error) {
            printCliError({
                type: "runtime",
                title: "创建内容失败",
                message: (error as Error).message,
                cause: error as Error,
                suggestions: [
                    { type: "fix", message: "检查配置文件是否正确" },
                    { type: "fix", message: "确保内容目录存在" },
                ],
            });
            process.exit(1);
        }
    });

program
    .command("migrate")
    .description("从其他平台迁移内容到 Doki Engine")
    .argument("<source>", "源平台类型 (hugo, hexo, jekyll, wordpress)")
    .option("-i, --input <path>", "输入路径（文件或目录）", ".")
    .option("-o, --output <path>", "输出目录", "content")
    .option(
        "-f, --format <format>",
        "Frontmatter 格式 (toml, yaml, json)",
        "yaml",
    )
    .option("--no-templates", "不转换模板语法", false)
    .option("--no-recursive", "不递归处理子目录", false)
    .addHelpText(
        "after",
        `
支持的平台:
  hugo       从 Hugo 迁移（支持 TOML/YAML frontmatter，Go Template）
  hexo       从 Hexo 迁移（支持 YAML frontmatter，EJS/Nunjucks）
  jekyll     从 Jekyll 迁移（支持 YAML frontmatter，Liquid）
  wordpress  从 WordPress 迁移（解析 WXR XML 导出文件）

示例:
  $ doki migrate hugo --input ./hugo-content --output ./content
  $ doki migrate hexo --input ./hexo-source --output ./content
  $ doki migrate jekyll --input ./_posts --output ./content
  $ doki migrate wordpress --input export.xml --output ./content
  $ doki migrate hugo -i ./content -o ./output -f toml

转换说明:
  - Hugo:     TOML(+++) 或 YAML(---) frontmatter -> 指定格式
              Go Template 语法 -> Doki 模板语法
  - Hexo:     YAML(---) frontmatter -> 指定格式
              EJS/Nunjucks 语法 -> Doki 模板语法
  - Jekyll:   YAML(---) frontmatter -> 指定格式
              Liquid 语法 -> Doki 模板语法
  - WordPress: WXR XML -> Markdown + 指定格式 frontmatter
`,
    )
    .action(async (source, options) => {
        console.log(chalk.cyan("╭──────────────────────────────────────╮"));
        console.log(
            chalk.cyan("│") +
                chalk.bold.white("   Doki Engine 内容迁移               ") +
                chalk.cyan("│"),
        );
        console.log(chalk.cyan("╰──────────────────────────────────────╯"));
        console.log();

        const supportedMigrators = getSupportedMigrators();
        const sourceType = source.toLowerCase() as MigratorType;

        if (!supportedMigrators.includes(sourceType)) {
            printCliError({
                type: "config",
                title: "不支持的迁移源",
                message: `不支持的源平台: ${source}`,
                suggestions: supportedMigrators.map((m) => ({
                    type: "command" as const,
                    message: `从 ${m} 迁移`,
                    command: `doki migrate ${m} --input ./source --output ./content`,
                })),
            });
            process.exit(1);
        }

        const validFormats = ["toml", "yaml", "json"];
        if (!validFormats.includes(options.format)) {
            printCliError({
                type: "config",
                title: "无效的格式",
                message: `不支持的 frontmatter 格式: ${options.format}`,
                suggestions: validFormats.map((f) => ({
                    type: "fix" as const,
                    message: `使用 ${f} 格式`,
                })),
            });
            process.exit(1);
        }

        const inputPath = resolve(options.input);
        if (!existsSync(inputPath)) {
            printCliError({
                type: "io",
                title: "输入路径不存在",
                message: `输入路径不存在: ${inputPath}`,
                filePath: inputPath,
                suggestions: [
                    { type: "fix", message: "检查输入路径是否正确" },
                    { type: "fix", message: "确保路径存在" },
                ],
            });
            process.exit(1);
        }

        const outputPath = resolve(options.output);

        console.log(chalk.white("  源平台: ") + chalk.blue(sourceType));
        console.log(chalk.white("  输入路径: ") + chalk.blue(inputPath));
        console.log(chalk.white("  输出路径: ") + chalk.blue(outputPath));
        console.log(
            chalk.white("  Frontmatter: ") +
                chalk.blue(options.format.toUpperCase()),
        );
        console.log(
            chalk.white("  转换模板: ") +
                chalk.blue(options.templates ? "是" : "否"),
        );
        console.log();

        console.log(chalk.cyan("开始迁移..."));
        console.log();

        const migrateOptions: MigrateOptions = {
            input: inputPath,
            output: outputPath,
            frontmatterFormat: options.format,
            convertTemplates: options.templates,
            recursive: options.recursive,
        };

        try {
            const result = await migrate(sourceType, migrateOptions);

            console.log();
            console.log(chalk.gray("─".repeat(40)));
            console.log();

            if (result.success) {
                printSuccess("迁移完成!");
                console.log();
                console.log(
                    chalk.white("  处理文件: ") +
                        chalk.green(`${result.filesProcessed} 个`),
                );
                if (result.filesSkipped > 0) {
                    console.log(
                        chalk.white("  跳过文件: ") +
                            chalk.yellow(`${result.filesSkipped} 个`),
                    );
                }
                console.log(
                    chalk.white("  输出目录: ") + chalk.blue(outputPath),
                );
                console.log();

                if (result.processedFiles && result.processedFiles.length > 0) {
                    console.log(chalk.cyan("已处理的文件:"));
                    const displayFiles = result.processedFiles.slice(0, 10);
                    for (const file of displayFiles) {
                        console.log(
                            chalk.gray(`  - ${relative(process.cwd(), file)}`),
                        );
                    }
                    if (result.processedFiles.length > 10) {
                        console.log(
                            chalk.gray(
                                `  ... 还有 ${result.processedFiles.length - 10} 个文件`,
                            ),
                        );
                    }
                    console.log();
                }

                console.log(chalk.cyan("下一步:"));
                console.log(chalk.white("  1. 检查迁移后的内容"));
                console.log(chalk.white("  2. 根据需要调整 frontmatter 字段"));
                console.log(chalk.white("  3. 运行 doki build 测试构建"));
                console.log();
            } else {
                printWarning("迁移完成，但有错误");
                console.log();
                console.log(
                    chalk.white("  处理文件: ") +
                        chalk.green(`${result.filesProcessed} 个`),
                );
                console.log(
                    chalk.white("  跳过文件: ") +
                        chalk.red(`${result.filesSkipped} 个`),
                );
                console.log();

                if (result.errors.length > 0) {
                    console.log(chalk.red("错误列表:"));
                    const displayErrors = result.errors.slice(0, 5);
                    for (const error of displayErrors) {
                        console.log(chalk.red(`  - ${error}`));
                    }
                    if (result.errors.length > 5) {
                        console.log(
                            chalk.red(
                                `  ... 还有 ${result.errors.length - 5} 个错误`,
                            ),
                        );
                    }
                    console.log();
                }

                process.exit(1);
            }
        } catch (error) {
            printCliError({
                type: "runtime",
                title: "迁移失败",
                message: (error as Error).message,
                cause: error as Error,
                suggestions: [
                    { type: "fix", message: "检查输入路径是否正确" },
                    { type: "fix", message: "确保有读写权限" },
                    { type: "fix", message: "检查文件格式是否正确" },
                ],
            });
            process.exit(1);
        }
    });

const themeCommand = program.command("theme").description("主题管理命令");

themeCommand
    .command("install")
    .description("安装主题包")
    .argument("<name>", "主题名称（支持简写）")
    .option("-v, --version <version>", "指定版本")
    .option("--no-save", "不保存到 package.json")
    .addHelpText(
        "after",
        `
示例:
  $ doki theme install minimal          安装 minimal 主题
  $ doki theme install minimal@1.0.0    安装指定版本
  $ doki theme install minimal --no-save 安装但不保存到 package.json

主题命名:
  简写名称会自动补全为 @doki-land/theme-<name>
  例如: minimal -> @doki-land/theme-minimal
`,
    )
    .action(async (name, options) => {
        await installTheme(name, options);
    });

themeCommand
    .command("list")
    .description("列出已安装的主题")
    .addHelpText(
        "after",
        `
示例:
  $ doki theme list    显示所有已安装的主题
`,
    )
    .action(async () => {
        await listThemes();
    });

const pluginCommand = program.command("plugin").description("插件管理命令");

pluginCommand
    .command("install")
    .description("安装插件包")
    .argument("<names...>", "插件名称（支持简写，可多个）")
    .option("-v, --version <version>", "指定版本")
    .option("--no-save", "不保存到 package.json")
    .addHelpText(
        "after",
        `
示例:
  $ doki plugin install seo              安装 seo 插件
  $ doki plugin install seo analytics    同时安装多个插件
  $ doki plugin install seo@1.0.0        安装指定版本

插件命名:
  简写名称会自动补全为 @doki-land/plugin-<name>
  例如: seo -> @doki-land/plugin-seo
`,
    )
    .action(async (names, options) => {
        await installPlugins(names, options);
    });

pluginCommand
    .command("list")
    .description("列出已安装的插件")
    .addHelpText(
        "after",
        `
示例:
  $ doki plugin list    显示所有已安装的插件
`,
    )
    .action(async () => {
        await listPlugins();
    });

program
    .command("create")
    .description("创建主题或插件包")
    .argument("<type>", "类型 (theme/plugin)")
    .argument("<name>", "包名称")
    .option("-o, --output <dir>", "输出目录", ".")
    .option("-a, --author <author>", "作者")
    .option("-d, --description <desc>", "描述")
    .addHelpText(
        "after",
        `
示例:
  $ doki create theme my-theme        创建主题包
  $ doki create plugin my-plugin      创建插件包
  $ doki create theme my-theme -o ./themes  指定输出目录
  $ doki create plugin my-plugin -a "John Doe"  指定作者

类型:
  theme    主题包，包含模板、样式和短代码
  plugin   插件包，包含构建钩子和扩展功能
`,
    )
    .action(async (type, name, options) => {
        if (type !== "theme" && type !== "plugin") {
            console.error(chalk.red(`无效的类型: ${type}`));
            console.log(chalk.gray("有效类型: theme, plugin"));
            process.exit(1);
        }

        await createPackage(type, name, options);
    });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
    program.outputHelp();
}
