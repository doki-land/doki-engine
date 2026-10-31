import { beforeEach, describe, expect, it } from "vitest";
import type { SearchConfig } from "../src/config.js";
import type { Content } from "../src/content.js";
import {
    createSegmenter,
    extractPlainText,
    generateSearchComponent,
    SearchIndexBuilder,
    type SearchIndexEntry,
    simpleSegment,
} from "../src/search.js";

describe("SearchIndexBuilder", () => {
    let builder: SearchIndexBuilder;
    const config: SearchConfig = {
        enabled: true,
        fields: ["title", "content", "tags"],
    };

    beforeEach(() => {
        builder = new SearchIndexBuilder(config);
    });

    describe("添加条目", () => {
        it("应该添加条目", () => {
            const entry: SearchIndexEntry = {
                url: "/test/",
                title: "Test Page",
                content: "This is a test page.",
            };

            builder.addEntry(entry);

            expect(builder.size).toBe(1);
        });

        it("应该添加多个条目", () => {
            const entry1: SearchIndexEntry = {
                url: "/test-1/",
                title: "Test Page 1",
                content: "Content 1",
            };

            const entry2: SearchIndexEntry = {
                url: "/test-2/",
                title: "Test Page 2",
                content: "Content 2",
            };

            builder.addEntry(entry1);
            builder.addEntry(entry2);

            expect(builder.size).toBe(2);
        });

        it("应该支持带可选字段的条目", () => {
            const entry: SearchIndexEntry = {
                url: "/test/",
                title: "Test Page",
                content: "Test content",
                description: "A test description",
                tags: ["test", "example"],
                category: "tech",
                date: "2024-01-01",
            };

            builder.addEntry(entry);

            expect(builder.size).toBe(1);
        });
    });

    describe("从内容添加条目", () => {
        it("应该从内容对象添加条目", () => {
            const content: Content = {
                sourcePath: "/content/test.md",
                relativePath: "test.md",
                url: "/test/",
                frontmatter: {
                    title: "Test Post",
                    tags: ["test"],
                    category: "tech",
                },
                rawContent: "Test content",
                html: "<p>Test content</p>",
                variables: {},
                lang: "en",
                baseName: "test",
                isDefaultLang: true,
            };

            builder.addEntryFromContent(content, [
                "title",
                "content",
                "tags",
                "category",
            ]);

            expect(builder.size).toBe(1);
        });

        it("应该正确提取 HTML 中的纯文本", () => {
            const content: Content = {
                sourcePath: "/content/test.md",
                relativePath: "test.md",
                url: "/test/",
                frontmatter: {
                    title: "Test Post",
                },
                rawContent: "Test content",
                html: "<p>Hello <strong>World</strong></p>",
                variables: {},
                lang: "en",
                baseName: "test",
                isDefaultLang: true,
            };

            builder.addEntryFromContent(content, ["title", "content"]);

            const index = builder.build();
            expect(index.entries[0].content).toBe("Hello World");
        });
    });

    describe("构建索引", () => {
        it("应该构建索引对象", () => {
            const entry: SearchIndexEntry = {
                url: "/test/",
                title: "Test Page",
                content: "Test content",
            };

            builder.addEntry(entry);
            const index = builder.build();

            expect(index.version).toBe("1.0.0");
            expect(index.generated).toBeDefined();
            expect(index.entries).toHaveLength(1);
            expect(index.entries[0].url).toBe("/test/");
        });

        it("应该生成 JSON 字符串", () => {
            const entry: SearchIndexEntry = {
                url: "/test/",
                title: "Test Page",
                content: "Test content",
            };

            builder.addEntry(entry);
            const json = builder.toJSON();

            expect(json).toContain('"version": "1.0.0"');
            expect(json).toContain('"url": "/test/"');
        });

        it("应该包含生成时间", () => {
            const index = builder.build();

            const generatedDate = new Date(index.generated);
            expect(generatedDate).toBeInstanceOf(Date);
        });
    });

    describe("清空索引", () => {
        it("应该清空所有条目", () => {
            const entry: SearchIndexEntry = {
                url: "/test/",
                title: "Test Page",
                content: "Test content",
            };

            builder.addEntry(entry);
            expect(builder.size).toBe(1);

            builder.clear();
            expect(builder.size).toBe(0);
        });
    });
});

describe("extractPlainText", () => {
    it("应该移除 HTML 标签", () => {
        const html = "<p>Hello <strong>World</strong></p>";
        const text = extractPlainText(html);

        expect(text).toBe("Hello World");
    });

    it("应该移除 script 标签及其内容", () => {
        const html = '<p>Content</p><script>alert("test")</script>';
        const text = extractPlainText(html);

        expect(text).toBe("Content");
    });

    it("应该移除 style 标签及其内容", () => {
        const html = "<p>Content</p><style>.test { color: red; }</style>";
        const text = extractPlainText(html);

        expect(text).toBe("Content");
    });

    it("应该解码 HTML 实体", () => {
        const html = "<p>Hello &amp; World &lt;test&gt;</p>";
        const text = extractPlainText(html);

        expect(text).toBe("Hello & World <test>");
    });

    it("应该处理 &nbsp;", () => {
        const html = "<p>Hello&nbsp;World</p>";
        const text = extractPlainText(html);

        expect(text).toBe("Hello World");
    });

    it("应该压缩空白字符", () => {
        const html = "<p>Hello    World</p>";
        const text = extractPlainText(html);

        expect(text).toBe("Hello World");
    });

    it("应该处理复杂的 HTML", () => {
        const html = `
      <div class="container">
        <h1>Title</h1>
        <p>Paragraph with <a href="#">link</a></p>
      </div>
    `;
        const text = extractPlainText(html);

        expect(text).toContain("Title");
        expect(text).toContain("Paragraph with link");
    });
});

describe("simpleSegment", () => {
    it("应该分割英文单词", () => {
        const text = "Hello World";
        const tokens = simpleSegment(text);

        expect(tokens).toContain("hello");
        expect(tokens).toContain("world");
    });

    it("应该提取中文字符", () => {
        const text = "你好世界";
        const tokens = simpleSegment(text);

        expect(tokens).toContain("你");
        expect(tokens).toContain("好");
        expect(tokens).toContain("世");
        expect(tokens).toContain("界");
    });

    it("应该处理混合文本", () => {
        const text = "Hello 世界";
        const tokens = simpleSegment(text);

        expect(tokens).toContain("hello");
        expect(tokens).toContain("世");
        expect(tokens).toContain("界");
    });

    it("应该忽略标点符号", () => {
        const text = "Hello, World!";
        const tokens = simpleSegment(text);

        expect(tokens).toContain("hello");
        expect(tokens).toContain("world");
        expect(tokens).not.toContain(",");
        expect(tokens).not.toContain("!");
    });

    it("应该处理数字", () => {
        const text = "Test 123 abc";
        const tokens = simpleSegment(text);

        expect(tokens).toContain("test");
        expect(tokens).toContain("123");
        expect(tokens).toContain("abc");
    });

    it("应该处理空字符串", () => {
        const tokens = simpleSegment("");
        expect(tokens).toEqual([]);
    });
});

describe("createSegmenter", () => {
    it("应该创建简单分词器", () => {
        const segmenter = createSegmenter("none");
        const tokens = segmenter("Hello World");

        expect(tokens).toContain("hello");
        expect(tokens).toContain("world");
    });

    it("jieba 不可用时应回退到简单分词器", () => {
        const segmenter = createSegmenter("jieba");
        const tokens = segmenter("Hello World");

        expect(tokens).toContain("hello");
        expect(tokens).toContain("world");
    });
});

describe("generateSearchComponent", () => {
    it("应该生成搜索组件代码", () => {
        const code = generateSearchComponent();

        expect(code).toContain("Doki Engine 搜索组件");
        expect(code).toContain("loadSearchIndex");
        expect(code).toContain("tokenize");
        expect(code).toContain("calculateScore");
        expect(code).toContain("search");
    });

    it("应该包含搜索结果渲染函数", () => {
        const code = generateSearchComponent();

        expect(code).toContain("renderResults");
    });

    it("应该包含初始化函数", () => {
        const code = generateSearchComponent();

        expect(code).toContain("init");
        expect(code).toContain("DOMContentLoaded");
    });
});

describe("SearchIndexEntry", () => {
    it("应该支持自定义字段", () => {
        const entry: SearchIndexEntry = {
            url: "/test/",
            title: "Test",
            content: "Content",
            customField: "custom value",
        };

        expect(entry.customField).toBe("custom value");
    });
});
