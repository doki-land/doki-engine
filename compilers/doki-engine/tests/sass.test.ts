import { describe, it, expect } from "vitest";
import { isSassFile, getOutputPath } from "../src/sass.js";
import type {
    SassConfig,
    SassCompileResult,
    SassCompileOptions,
} from "../src/sass.js";

describe("isSassFile", () => {
    it("应该识别 .scss 文件", () => {
        expect(isSassFile("style.scss")).toBe(true);
    });

    it("应该识别 .sass 文件", () => {
        expect(isSassFile("style.sass")).toBe(true);
    });

    it("不应该识别其他文件类型", () => {
        expect(isSassFile("style.css")).toBe(false);
        expect(isSassFile("style.less")).toBe(false);
        expect(isSassFile("style.styl")).toBe(false);
        expect(isSassFile("style.js")).toBe(false);
        expect(isSassFile("style.ts")).toBe(false);
    });

    it("应该处理大写扩展名", () => {
        expect(isSassFile("style.SCSS")).toBe(true);
        expect(isSassFile("style.SASS")).toBe(true);
        expect(isSassFile("style.ScSs")).toBe(true);
    });

    it("应该处理带路径的文件名", () => {
        expect(isSassFile("/path/to/style.scss")).toBe(true);
        expect(isSassFile("C:\\path\\to\\style.sass")).toBe(true);
        expect(isSassFile("./styles/main.scss")).toBe(true);
        expect(isSassFile("../styles/utils.sass")).toBe(true);
    });

    it("应该处理无扩展名的文件", () => {
        expect(isSassFile("style")).toBe(false);
        expect(isSassFile("/path/to/style")).toBe(false);
    });

    it("应该处理空字符串", () => {
        expect(isSassFile("")).toBe(false);
    });

    it("应该处理只有扩展名的文件", () => {
        expect(isSassFile(".scss")).toBe(false);
        expect(isSassFile(".sass")).toBe(false);
    });
});

describe("getOutputPath", () => {
    it("应该将 .scss 扩展名改为 .css", () => {
        const inputPath = "/styles/main.scss";
        const outputDir = "/dist/css";

        const outputPath = getOutputPath(inputPath, outputDir);

        expect(outputPath).toContain("main.css");
        expect(outputPath).toContain("dist");
        expect(outputPath).toContain("css");
    });

    it("应该将 .sass 扩展名改为 .css", () => {
        const inputPath = "/styles/utils.sass";
        const outputDir = "/dist/css";

        const outputPath = getOutputPath(inputPath, outputDir);

        expect(outputPath).toContain("utils.css");
        expect(outputPath).toContain("dist");
        expect(outputPath).toContain("css");
    });

    it("应该处理带子目录的路径", () => {
        const inputPath = "/styles/components/button.scss";
        const outputDir = "/dist/css";

        const outputPath = getOutputPath(inputPath, outputDir);

        expect(outputPath).toContain("button.css");
        expect(outputPath).toContain("dist");
        expect(outputPath).toContain("css");
    });

    it("应该处理 Windows 路径", () => {
        const inputPath = "C:\\styles\\main.scss";
        const outputDir = "C:\\dist\\css";

        const outputPath = getOutputPath(inputPath, outputDir);

        expect(outputPath).toContain("main.css");
    });

    it("应该处理相对路径", () => {
        const inputPath = "./src/styles/main.scss";
        const outputDir = "./dist/css";

        const outputPath = getOutputPath(inputPath, outputDir);

        expect(outputPath).toContain("main.css");
    });

    it("应该处理文件名包含多个点的情况", () => {
        const inputPath = "/styles/component.button.scss";
        const outputDir = "/dist/css";

        const outputPath = getOutputPath(inputPath, outputDir);

        expect(outputPath).toContain("component.button.css");
        expect(outputPath).toContain("dist");
        expect(outputPath).toContain("css");
    });
});

describe("SassConfig 类型", () => {
    it("应该正确设置配置选项", () => {
        const config: SassConfig = {
            enabled: true,
            style: "expanded",
            sourceMap: true,
            includePaths: ["/styles", "/vendor"],
        };

        expect(config.enabled).toBe(true);
        expect(config.style).toBe("expanded");
        expect(config.sourceMap).toBe(true);
        expect(config.includePaths).toHaveLength(2);
    });

    it("应该支持 compressed 样式", () => {
        const config: SassConfig = {
            enabled: true,
            style: "compressed",
            sourceMap: false,
            includePaths: [],
        };

        expect(config.style).toBe("compressed");
    });

    it("应该支持空的 includePaths", () => {
        const config: SassConfig = {
            enabled: true,
            style: "expanded",
            sourceMap: false,
            includePaths: [],
        };

        expect(config.includePaths).toEqual([]);
    });
});

describe("SassCompileOptions 类型", () => {
    it("应该正确设置编译选项", () => {
        const options: SassCompileOptions = {
            filePath: "/test/style.scss",
            includePaths: ["/styles", "/vendor"],
            style: "compressed",
            sourceMap: true,
        };

        expect(options.filePath).toBe("/test/style.scss");
        expect(options.includePaths).toHaveLength(2);
        expect(options.style).toBe("compressed");
        expect(options.sourceMap).toBe(true);
    });

    it("所有选项应该是可选的", () => {
        const options: SassCompileOptions = {};

        expect(options.filePath).toBeUndefined();
        expect(options.includePaths).toBeUndefined();
        expect(options.style).toBeUndefined();
        expect(options.sourceMap).toBeUndefined();
    });

    it("应该支持部分选项", () => {
        const options: SassCompileOptions = {
            style: "expanded",
        };

        expect(options.style).toBe("expanded");
        expect(options.sourceMap).toBeUndefined();
    });
});

describe("SassCompileResult 类型", () => {
    it("成功结果应该包含 CSS", () => {
        const result: SassCompileResult = {
            css: ".test { color: red; }",
            outputFilePath: "/output/style.css",
            success: true,
        };

        expect(result.success).toBe(true);
        expect(result.css).toBeDefined();
        expect(result.error).toBeUndefined();
    });

    it("失败结果应该包含错误信息", () => {
        const result: SassCompileResult = {
            css: "",
            outputFilePath: "/output/style.css",
            success: false,
            error: "Compilation failed",
        };

        expect(result.success).toBe(false);
        expect(result.error).toBe("Compilation failed");
    });

    it("成功结果可以包含 Source Map", () => {
        const result: SassCompileResult = {
            css: ".test { color: red; }",
            sourceMap: '{"version":3}',
            outputFilePath: "/output/style.css",
            success: true,
        };

        expect(result.sourceMap).toBeDefined();
        expect(result.sourceMap).toBe('{"version":3}');
    });

    it("失败结果可以不包含 CSS", () => {
        const result: SassCompileResult = {
            css: "",
            outputFilePath: "/output/style.css",
            success: false,
            error: "Sass syntax error",
        };

        expect(result.css).toBe("");
        expect(result.success).toBe(false);
    });
});
