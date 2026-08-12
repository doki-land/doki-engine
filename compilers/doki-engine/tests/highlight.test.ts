import { describe, it, expect, vi } from "vitest";
import {
    createHighlighter,
    parseCodeMeta,
    highlightCode,
    HighlightOptions,
    ParsedCodeMeta,
} from "../src/highlight.js";
import type { HighlightConfig } from "../src/config.js";

vi.mock("shiki", () => ({
    createHighlighter: vi.fn(async () => ({
        codeToHtml: vi.fn(async (code: string, options: any) => {
            return `<pre class="shiki" style="background-color: #1e1e1e"><code><span class="line"><span style="color: #d4d4d4">${escapeHtml(code)}</span></span></code></pre>`;
        }),
        getLoadedLanguages: vi.fn(() => [
            "javascript",
            "typescript",
            "python",
            "rust",
            "go",
            "java",
            "c",
            "cpp",
            "html",
            "css",
            "json",
            "yaml",
            "markdown",
            "bash",
            "shell",
        ]),
    })),
}));

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

describe("parseCodeMeta", () => {
    describe("基本解析", () => {
        it("应该解析语言名称", () => {
            const result = parseCodeMeta("typescript");
            expect(result.lang).toBe("typescript");
            expect(result.highlightLines).toEqual([]);
            expect(result.lineNumbers).toBe(false);
            expect(result.startLine).toBe(1);
        });

        it("应该处理空字符串", () => {
            const result = parseCodeMeta("");
            expect(result.lang).toBe("");
            expect(result.highlightLines).toEqual([]);
        });

        it("应该处理只有空格的字符串", () => {
            const result = parseCodeMeta("   ");
            expect(result.lang).toBe("");
        });
    });

    describe("行号解析", () => {
        it("应该解析 showLineNumbers 标记", () => {
            const result = parseCodeMeta("typescript showLineNumbers");
            expect(result.lineNumbers).toBe(true);
        });

        it("应该解析起始行号", () => {
            const result = parseCodeMeta("typescript :10");
            expect(result.startLine).toBe(10);
        });

        it("应该忽略无效的起始行号", () => {
            const result = parseCodeMeta("typescript :abc");
            expect(result.startLine).toBe(1);
        });

        it("应该忽略负数的起始行号", () => {
            const result = parseCodeMeta("typescript :-5");
            expect(result.startLine).toBe(1);
        });
    });

    describe("高亮行解析", () => {
        it("应该解析单行高亮", () => {
            const result = parseCodeMeta("typescript {1}");
            expect(result.highlightLines).toEqual([1]);
        });

        it("应该解析多行高亮（逗号分隔）", () => {
            const result = parseCodeMeta("typescript {1,3,5}");
            expect(result.highlightLines).toEqual([1, 3, 5]);
        });

        it("应该解析行范围", () => {
            const result = parseCodeMeta("typescript {1-5}");
            expect(result.highlightLines).toEqual([1, 2, 3, 4, 5]);
        });

        it("应该解析混合行号和范围", () => {
            const result = parseCodeMeta("typescript {1,3-5,7}");
            expect(result.highlightLines).toEqual([1, 3, 4, 5, 7]);
        });

        it("应该去重并排序行号", () => {
            const result = parseCodeMeta("typescript {5,3,5,1}");
            expect(result.highlightLines).toEqual([1, 3, 5]);
        });
    });

    describe("组合选项", () => {
        it("应该解析所有选项的组合", () => {
            const result = parseCodeMeta(
                "typescript showLineNumbers :10 {1,3-5}",
            );
            expect(result.lang).toBe("typescript");
            expect(result.lineNumbers).toBe(true);
            expect(result.startLine).toBe(10);
            expect(result.highlightLines).toEqual([1, 3, 4, 5]);
        });

        it("应该处理选项的不同顺序", () => {
            const result = parseCodeMeta("typescript {1-3} showLineNumbers :5");
            expect(result.lang).toBe("typescript");
            expect(result.lineNumbers).toBe(true);
            expect(result.startLine).toBe(5);
            expect(result.highlightLines).toEqual([1, 2, 3]);
        });
    });
});

describe("createHighlighter", () => {
    it("应该创建高亮器实例", async () => {
        const config: HighlightConfig = {
            enabled: true,
            theme: "github-dark",
            lineNumbers: false,
        };

        const highlighter = await createHighlighter(config);

        expect(highlighter).toBeDefined();
        expect(typeof highlighter.highlight).toBe("function");
        expect(typeof highlighter.getLoadedLanguages).toBe("function");
    });

    it("应该返回已加载的语言列表", async () => {
        const config: HighlightConfig = {
            enabled: true,
            theme: "github-dark",
            lineNumbers: false,
        };

        const highlighter = await createHighlighter(config);
        const languages = highlighter.getLoadedLanguages();

        expect(languages).toContain("javascript");
        expect(languages).toContain("typescript");
        expect(languages).toContain("python");
    });
});

describe("highlightCode", () => {
    it("应该高亮代码", async () => {
        const config: HighlightConfig = {
            enabled: true,
            theme: "github-dark",
            lineNumbers: false,
        };

        const code = "const x = 1;";
        const html = await highlightCode(code, "typescript", config);

        expect(html).toContain("<pre");
        expect(html).toContain("const x = 1;");
    });

    it("禁用高亮时应该转义代码", async () => {
        const config: HighlightConfig = {
            enabled: false,
            theme: "github-dark",
            lineNumbers: false,
        };

        const code = "const x = <script>alert(1)</script>;";
        const html = await highlightCode(code, "typescript", config);

        expect(html).toContain("&lt;script&gt;");
        expect(html).not.toContain("<script>");
    });

    it("应该处理行号选项", async () => {
        const config: HighlightConfig = {
            enabled: true,
            theme: "github-dark",
            lineNumbers: true,
        };

        const code = "const x = 1;";
        const html = await highlightCode(code, "typescript", config);

        expect(html).toContain("data-line");
    });

    it("应该处理高亮行选项", async () => {
        const config: HighlightConfig = {
            enabled: true,
            theme: "github-dark",
            lineNumbers: false,
        };

        const options: HighlightOptions = {
            highlightLines: [1],
        };

        const code = "const x = 1;";
        const html = await highlightCode(code, "typescript", config, options);

        expect(html).toContain("highlighted");
    });
});

describe("HighlightOptions", () => {
    it("应该正确设置高亮选项", () => {
        const options: HighlightOptions = {
            lineNumbers: true,
            highlightLines: [1, 2, 3],
            startLine: 10,
        };

        expect(options.lineNumbers).toBe(true);
        expect(options.highlightLines).toEqual([1, 2, 3]);
        expect(options.startLine).toBe(10);
    });

    it("所有选项应该是可选的", () => {
        const options: HighlightOptions = {};

        expect(options.lineNumbers).toBeUndefined();
        expect(options.highlightLines).toBeUndefined();
        expect(options.startLine).toBeUndefined();
    });
});
