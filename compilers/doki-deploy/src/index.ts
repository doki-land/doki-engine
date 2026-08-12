import { join, dirname } from "path";
import { fileURLToPath } from "url";

/**
 * Doki Deployer - 部署配置生成器
 * 入口模块
 */
export const VERSION = "0.1.0";

/**
 * 部署平台类型
 */
export type DeployPlatform = "netlify" | "vercel" | "github" | "cloudflare";

/**
 * 部署配置生成选项
 */
export interface DeployConfigOptions {
    platform: DeployPlatform;
    outputDir: string;
    nodeVersion?: string;
}

/**
 * 部署模板配置
 */
export interface DeployTemplate {
    name: string;
    templateFile: string;
    outputFile: string;
    description: string;
}

/**
 * 支持的平台列表
 */
export const SUPPORTED_PLATFORMS: DeployPlatform[] = [
    "netlify",
    "vercel",
    "github",
    "cloudflare",
];

/**
 * 部署模板映射
 */
const DEPLOY_TEMPLATES: Record<DeployPlatform, DeployTemplate> = {
    netlify: {
        name: "Netlify",
        templateFile: "netlify.toml",
        outputFile: "netlify.toml",
        description: "Netlify 配置文件",
    },
    vercel: {
        name: "Vercel",
        templateFile: "vercel.json",
        outputFile: "vercel.json",
        description: "Vercel 配置文件",
    },
    github: {
        name: "GitHub Pages",
        templateFile: "github-workflows-deploy.yml",
        outputFile: ".github/workflows/deploy.yml",
        description: "GitHub Actions 工作流",
    },
    cloudflare: {
        name: "Cloudflare Pages",
        templateFile: "wrangler.toml",
        outputFile: "wrangler.toml",
        description: "Cloudflare Pages 配置文件",
    },
};

/**
 * 获取模板目录路径
 */
function getTemplatesDir(): string {
    return join(dirname(fileURLToPath(import.meta.url)), "..", "templates");
}

/**
 * 生成 Netlify 配置
 * @param options 部署配置选项
 * @returns Netlify 配置文件内容
 */
export function generateNetlifyConfig(options: DeployConfigOptions): string {
    const nodeVersion = options.nodeVersion || "20";
    const outputDir = options.outputDir || "dist";

    return `[build]
  command = "doki build"
  publish = "${outputDir}"

[build.environment]
  NODE_VERSION = "${nodeVersion}"
`;
}

/**
 * 生成 Vercel 配置
 * @param options 部署配置选项
 * @returns Vercel 配置文件内容
 */
export function generateVercelConfig(options: DeployConfigOptions): string {
    const outputDir = options.outputDir || "dist";

    return JSON.stringify(
        {
            buildCommand: "doki build",
            outputDirectory: outputDir,
            framework: null,
        },
        null,
        2,
    );
}

/**
 * 生成 GitHub Actions 配置
 * @param options 部署配置选项
 * @returns GitHub Actions 工作流文件内容
 */
export function generateGitHubActionsConfig(
    options: DeployConfigOptions,
): string {
    const nodeVersion = options.nodeVersion || "20";
    const outputDir = options.outputDir || "dist";

    return `name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: ${nodeVersion}
          cache: pnpm
      - run: pnpm install
      - run: pnpm exec doki build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ${outputDir}

  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
`;
}

/**
 * 生成 Cloudflare Pages 配置
 * @param options 部署配置选项
 * @returns Cloudflare Pages 配置文件内容
 */
export function generateCloudflareConfig(options: DeployConfigOptions): string {
    const outputDir = options.outputDir || "dist";

    return `name = "doki-site"
compatibility_date = "2024-01-01"
pages_build_output_dir = "${outputDir}"
`;
}

/**
 * 获取配置文件路径
 * @param platform 部署平台
 * @returns 配置文件的输出路径
 */
export function getConfigFilePath(platform: DeployPlatform): string {
    const template = DEPLOY_TEMPLATES[platform];
    if (!template) {
        throw new Error(`Unsupported platform: ${platform}`);
    }
    return template.outputFile;
}

/**
 * 获取部署模板信息
 * @param platform 部署平台
 * @returns 部署模板配置
 */
export function getDeployTemplate(platform: DeployPlatform): DeployTemplate {
    const template = DEPLOY_TEMPLATES[platform];
    if (!template) {
        throw new Error(`Unsupported platform: ${platform}`);
    }
    return template;
}

/**
 * 根据平台生成配置内容
 * @param options 部署配置选项
 * @returns 配置文件内容
 */
export function generateDeployConfigContent(
    options: DeployConfigOptions,
): string {
    switch (options.platform) {
        case "netlify":
            return generateNetlifyConfig(options);
        case "vercel":
            return generateVercelConfig(options);
        case "github":
            return generateGitHubActionsConfig(options);
        case "cloudflare":
            return generateCloudflareConfig(options);
        default:
            throw new Error(`Unsupported platform: ${options.platform}`);
    }
}

/**
 * 获取模板文件路径
 * @param platform 部署平台
 * @returns 模板文件的完整路径
 */
export function getTemplateFilePath(platform: DeployPlatform): string {
    const template = DEPLOY_TEMPLATES[platform];
    if (!template) {
        throw new Error(`Unsupported platform: ${platform}`);
    }
    return join(getTemplatesDir(), template.templateFile);
}

/**
 * 检查平台是否支持
 * @param platform 平台名称
 * @returns 是否为支持的平台
 */
export function isPlatformSupported(
    platform: string,
): platform is DeployPlatform {
    return SUPPORTED_PLATFORMS.includes(platform as DeployPlatform);
}

/**
 * 获取所有支持的模板信息
 * @returns 所有部署平台的模板配置
 */
export function getAllDeployTemplates(): Record<
    DeployPlatform,
    DeployTemplate
> {
    return { ...DEPLOY_TEMPLATES };
}
