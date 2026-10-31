import { describe, expect, it } from "vitest";
import {
    type DeployConfigOptions,
    generateDeployConfigContent,
    generateGitHubActionsConfig,
    generateNetlifyConfig,
    generateVercelConfig,
    getAllDeployTemplates,
    getConfigFilePath,
    getDeployTemplate,
    isPlatformSupported,
    SUPPORTED_PLATFORMS,
} from "../src/index.js";

describe("generateNetlifyConfig", () => {
    it("应该生成有效的 Netlify 配置", () => {
        const options: DeployConfigOptions = {
            platform: "netlify",
            outputDir: "dist",
        };

        const config = generateNetlifyConfig(options);

        expect(config).toContain("[build]");
        expect(config).toContain('command = "doki build"');
        expect(config).toContain('publish = "dist"');
    });

    it("应该使用自定义输出目录", () => {
        const options: DeployConfigOptions = {
            platform: "netlify",
            outputDir: "public",
        };

        const config = generateNetlifyConfig(options);

        expect(config).toContain('publish = "public"');
    });

    it("应该使用自定义 Node 版本", () => {
        const options: DeployConfigOptions = {
            platform: "netlify",
            outputDir: "dist",
            nodeVersion: "18",
        };

        const config = generateNetlifyConfig(options);

        expect(config).toContain('NODE_VERSION = "18"');
    });

    it("默认应该使用 Node 20", () => {
        const options: DeployConfigOptions = {
            platform: "netlify",
            outputDir: "dist",
        };

        const config = generateNetlifyConfig(options);

        expect(config).toContain('NODE_VERSION = "20"');
    });

    it("静态多页站点不默认注入 SPA 重定向", () => {
        const options: DeployConfigOptions = {
            platform: "netlify",
            outputDir: "dist",
        };

        const config = generateNetlifyConfig(options);

        expect(config).not.toContain("[[redirects]]");
    });
});

describe("generateVercelConfig", () => {
    it("应该生成有效的 Vercel JSON 配置", () => {
        const options: DeployConfigOptions = {
            platform: "vercel",
            outputDir: "dist",
        };

        const config = generateVercelConfig(options);
        const parsed = JSON.parse(config);

        expect(parsed.buildCommand).toBe("doki build");
        expect(parsed.outputDirectory).toBe("dist");
        expect(parsed.framework).toBeNull();
    });

    it("应该使用自定义输出目录", () => {
        const options: DeployConfigOptions = {
            platform: "vercel",
            outputDir: "build",
        };

        const config = generateVercelConfig(options);
        const parsed = JSON.parse(config);

        expect(parsed.outputDirectory).toBe("build");
    });

    it("应该是格式化的 JSON", () => {
        const options: DeployConfigOptions = {
            platform: "vercel",
            outputDir: "dist",
        };

        const config = generateVercelConfig(options);

        expect(config).toContain("{\n");
        expect(config).toContain("\n}");
    });
});

describe("generateGitHubActionsConfig", () => {
    it("应该生成有效的 GitHub Actions 工作流", () => {
        const options: DeployConfigOptions = {
            platform: "github",
            outputDir: "dist",
        };

        const config = generateGitHubActionsConfig(options);

        expect(config).toContain("name: Deploy to GitHub Pages");
        expect(config).toContain("on:");
        expect(config).toContain("push:");
        expect(config).toContain("branches: [main]");
    });

    it("应该包含正确的构建步骤", () => {
        const options: DeployConfigOptions = {
            platform: "github",
            outputDir: "dist",
        };

        const config = generateGitHubActionsConfig(options);

        expect(config).toContain("uses: actions/checkout@v4");
        expect(config).toContain("uses: pnpm/action-setup@v2");
        expect(config).toContain("uses: actions/setup-node@v4");
        expect(config).toContain("run: pnpm install");
        expect(config).toContain("run: pnpm exec doki build");
    });

    it("应该使用自定义 Node 版本", () => {
        const options: DeployConfigOptions = {
            platform: "github",
            outputDir: "dist",
            nodeVersion: "18",
        };

        const config = generateGitHubActionsConfig(options);

        expect(config).toContain("node-version: 18");
    });

    it("应该使用自定义输出目录", () => {
        const options: DeployConfigOptions = {
            platform: "github",
            outputDir: "public",
        };

        const config = generateGitHubActionsConfig(options);

        expect(config).toContain("path: public");
    });

    it("应该包含正确的权限配置", () => {
        const options: DeployConfigOptions = {
            platform: "github",
            outputDir: "dist",
        };

        const config = generateGitHubActionsConfig(options);

        expect(config).toContain("permissions:");
        expect(config).toContain("contents: read");
        expect(config).toContain("pages: write");
        expect(config).toContain("id-token: write");
    });

    it("应该包含部署步骤", () => {
        const options: DeployConfigOptions = {
            platform: "github",
            outputDir: "dist",
        };

        const config = generateGitHubActionsConfig(options);

        expect(config).toContain("uses: actions/upload-pages-artifact@v3");
        expect(config).toContain("uses: actions/deploy-pages@v4");
    });

    it("应该包含 workflow_dispatch 触发器", () => {
        const options: DeployConfigOptions = {
            platform: "github",
            outputDir: "dist",
        };

        const config = generateGitHubActionsConfig(options);

        expect(config).toContain("workflow_dispatch:");
    });
});

describe("getConfigFilePath", () => {
    it("应该返回 Netlify 配置文件路径", () => {
        const path = getConfigFilePath("netlify");
        expect(path).toBe("netlify.toml");
    });

    it("应该返回 Vercel 配置文件路径", () => {
        const path = getConfigFilePath("vercel");
        expect(path).toBe("vercel.json");
    });

    it("应该返回 GitHub Actions 配置文件路径", () => {
        const path = getConfigFilePath("github");
        expect(path).toBe(".github/workflows/deploy.yml");
    });

    it("不支持的平台应该抛出错误", () => {
        expect(() => getConfigFilePath("unknown" as any)).toThrow(
            "Unsupported platform: unknown",
        );
    });
});

describe("getDeployTemplate", () => {
    it("应该返回 Netlify 模板信息", () => {
        const template = getDeployTemplate("netlify");

        expect(template.name).toBe("Netlify");
        expect(template.templateFile).toBe("netlify.toml");
        expect(template.outputFile).toBe("netlify.toml");
        expect(template.description).toBe("Netlify 配置文件");
    });

    it("应该返回 Vercel 模板信息", () => {
        const template = getDeployTemplate("vercel");

        expect(template.name).toBe("Vercel");
        expect(template.templateFile).toBe("vercel.json");
        expect(template.outputFile).toBe("vercel.json");
        expect(template.description).toBe("Vercel 配置文件");
    });

    it("应该返回 GitHub 模板信息", () => {
        const template = getDeployTemplate("github");

        expect(template.name).toBe("GitHub Pages");
        expect(template.templateFile).toBe("github-workflows-deploy.yml");
        expect(template.outputFile).toBe(".github/workflows/deploy.yml");
        expect(template.description).toBe("GitHub Actions 工作流");
    });

    it("不支持的平台应该抛出错误", () => {
        expect(() => getDeployTemplate("invalid" as any)).toThrow(
            "Unsupported platform: invalid",
        );
    });
});

describe("generateDeployConfigContent", () => {
    it("应该为 Netlify 生成正确的配置", () => {
        const options: DeployConfigOptions = {
            platform: "netlify",
            outputDir: "dist",
        };

        const content = generateDeployConfigContent(options);

        expect(content).toContain("[build]");
        expect(content).toContain('publish = "dist"');
    });

    it("应该为 Vercel 生成正确的配置", () => {
        const options: DeployConfigOptions = {
            platform: "vercel",
            outputDir: "dist",
        };

        const content = generateDeployConfigContent(options);
        const parsed = JSON.parse(content);

        expect(parsed.outputDirectory).toBe("dist");
    });

    it("应该为 GitHub 生成正确的配置", () => {
        const options: DeployConfigOptions = {
            platform: "github",
            outputDir: "dist",
        };

        const content = generateDeployConfigContent(options);

        expect(content).toContain("name: Deploy to GitHub Pages");
    });

    it("不支持的平台应该抛出错误", () => {
        const options = {
            platform: "unknown" as any,
            outputDir: "dist",
        };

        expect(() => generateDeployConfigContent(options)).toThrow(
            "Unsupported platform: unknown",
        );
    });
});

describe("isPlatformSupported", () => {
    it("应该识别支持的平台", () => {
        expect(isPlatformSupported("netlify")).toBe(true);
        expect(isPlatformSupported("vercel")).toBe(true);
        expect(isPlatformSupported("github")).toBe(true);
    });

    it("应该识别不支持的平台", () => {
        expect(isPlatformSupported("aws")).toBe(false);
        expect(isPlatformSupported("heroku")).toBe(false);
        expect(isPlatformSupported("")).toBe(false);
        expect(isPlatformSupported("random")).toBe(false);
    });
});

describe("getAllDeployTemplates", () => {
    it("应该返回所有支持的模板", () => {
        const templates = getAllDeployTemplates();

        expect(templates.netlify).toBeDefined();
        expect(templates.vercel).toBeDefined();
        expect(templates.github).toBeDefined();
    });

    it("返回的模板应该是副本", () => {
        const templates1 = getAllDeployTemplates();
        const templates2 = getAllDeployTemplates();

        expect(templates1).not.toBe(templates2);
        expect(templates1.netlify).toEqual(templates2.netlify);
    });
});

describe("SUPPORTED_PLATFORMS", () => {
    it("应该包含所有支持的平台", () => {
        expect(SUPPORTED_PLATFORMS).toContain("netlify");
        expect(SUPPORTED_PLATFORMS).toContain("vercel");
        expect(SUPPORTED_PLATFORMS).toContain("github");
    });

    it("应该包含 4 个支持的平台", () => {
        expect(SUPPORTED_PLATFORMS).toHaveLength(4);
    });
});

describe("配置生成一致性", () => {
    it("相同选项应该生成相同的 Netlify 配置", () => {
        const options: DeployConfigOptions = {
            platform: "netlify",
            outputDir: "dist",
            nodeVersion: "20",
        };

        const config1 = generateNetlifyConfig(options);
        const config2 = generateNetlifyConfig(options);

        expect(config1).toBe(config2);
    });

    it("相同选项应该生成相同的 Vercel 配置", () => {
        const options: DeployConfigOptions = {
            platform: "vercel",
            outputDir: "dist",
        };

        const config1 = generateVercelConfig(options);
        const config2 = generateVercelConfig(options);

        expect(config1).toBe(config2);
    });

    it("相同选项应该生成相同的 GitHub Actions 配置", () => {
        const options: DeployConfigOptions = {
            platform: "github",
            outputDir: "dist",
            nodeVersion: "20",
        };

        const config1 = generateGitHubActionsConfig(options);
        const config2 = generateGitHubActionsConfig(options);

        expect(config1).toBe(config2);
    });
});

describe("默认值处理", () => {
    it("Netlify 配置应该使用默认输出目录", () => {
        const options: DeployConfigOptions = {
            platform: "netlify",
            outputDir: "",
        };

        const config = generateNetlifyConfig(options);

        expect(config).toContain('publish = "dist"');
    });

    it("Vercel 配置应该使用默认输出目录", () => {
        const options: DeployConfigOptions = {
            platform: "vercel",
            outputDir: "",
        };

        const config = generateVercelConfig(options);
        const parsed = JSON.parse(config);

        expect(parsed.outputDirectory).toBe("dist");
    });

    it("GitHub Actions 配置应该使用默认输出目录", () => {
        const options: DeployConfigOptions = {
            platform: "github",
            outputDir: "",
        };

        const config = generateGitHubActionsConfig(options);

        expect(config).toContain("path: dist");
    });
});
