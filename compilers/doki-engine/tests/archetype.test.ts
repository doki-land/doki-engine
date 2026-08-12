import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import {
    ArchetypeManager,
    generateSlug,
    generateFilename,
    generateFrontmatter,
    formatDate,
    type Archetype,
    type CreateContentOptions,
} from "../src/archetype";

describe("generateSlug", () => {
    it("应该将标题转换为小写", () => {
        expect(generateSlug("Hello World")).toBe("hello-world");
    });

    it("应该将空格替换为连字符", () => {
        expect(generateSlug("my first post")).toBe("my-first-post");
    });

    it("应该移除特殊字符", () => {
        expect(generateSlug("Hello! World? #Tag")).toBe("hello-world-tag");
    });

    it("应该保留中文字符", () => {
        expect(generateSlug("你好世界")).toBe("你好世界");
    });

    it("应该处理多个连续空格", () => {
        expect(generateSlug("Hello    World")).toBe("hello-world");
    });

    it("应该移除开头和结尾的连字符", () => {
        expect(generateSlug("---Hello World---")).toBe("hello-world");
    });

    it("应该处理混合内容", () => {
        expect(generateSlug("Hello 世界! Test")).toBe("hello-世界-test");
    });

    it("空字符串应该返回空字符串", () => {
        expect(generateSlug("")).toBe("");
    });

    it("只有特殊字符应该返回空字符串", () => {
        expect(generateSlug("!!!???")).toBe("");
    });

    it("应该处理数字", () => {
        expect(generateSlug("Post 123 Title")).toBe("post-123-title");
    });

    it("应该保留下划线", () => {
        expect(generateSlug("my_post_title")).toBe("my_post_title");
    });
});

describe("generateFilename", () => {
    it("应该生成带日期的文件名", () => {
        const filename = generateFilename("My Post", "2024-01-15");
        expect(filename).toBe("2024-01-15-my-post.md");
    });

    it("应该生成不带日期的文件名", () => {
        const filename = generateFilename("My Post");
        expect(filename).toBe("my-post.md");
    });

    it("应该正确处理中文标题", () => {
        const filename = generateFilename("中文标题", "2024-01-15");
        expect(filename).toBe("2024-01-15-中文标题.md");
    });

    it("应该正确处理特殊字符标题", () => {
        const filename = generateFilename("Hello! World?", "2024-03-20");
        expect(filename).toBe("2024-03-20-hello-world.md");
    });
});

describe("generateFrontmatter", () => {
    it("应该生成基本的 frontmatter", () => {
        const frontmatter = generateFrontmatter({
            title: "Test Post",
            date: "2024-01-15",
            draft: false,
            layout: "post",
        });

        expect(frontmatter).toContain('title: "Test Post"');
        expect(frontmatter).toContain('date: "2024-01-15"');
        expect(frontmatter).toContain("draft: false");
        expect(frontmatter).toContain('layout: "post"');
        expect(frontmatter).toContain('description: ""');
        expect(frontmatter).toContain("---");
    });

    it("应该正确处理草稿状态", () => {
        const frontmatter = generateFrontmatter({
            title: "Draft Post",
            date: "2024-01-15",
            draft: true,
            layout: "post",
        });

        expect(frontmatter).toContain("draft: true");
    });

    it("应该处理包含特殊字符的标题", () => {
        const frontmatter = generateFrontmatter({
            title: 'Test "Quoted" Title',
            date: "2024-01-15",
            draft: false,
            layout: "post",
        });

        expect(frontmatter).toContain('title: "Test \\"Quoted\\" Title"');
    });

    it("应该处理包含换行符的标题", () => {
        const frontmatter = generateFrontmatter({
            title: "Line1\nLine2",
            date: "2024-01-15",
            draft: false,
            layout: "post",
        });

        expect(frontmatter).toContain('title: "Line1');
        expect(frontmatter).toContain('Line2"');
    });

    it("应该合并原型 frontmatter", () => {
        const archetype: Archetype = {
            type: "post",
            frontmatter: {
                tags: ["default-tag"],
                author: "Default Author",
                custom: "value",
            },
        };

        const frontmatter = generateFrontmatter({
            title: "Test Post",
            date: "2024-01-15",
            draft: false,
            layout: "post",
            archetype,
        });

        expect(frontmatter).toContain('title: "Test Post"');
        expect(frontmatter).toContain("tags:");
        expect(frontmatter).toContain('"default-tag"');
        expect(frontmatter).toContain('author: "Default Author"');
        expect(frontmatter).toContain('custom: "value"');
    });

    it("原型 frontmatter 不应该覆盖基本字段", () => {
        const archetype: Archetype = {
            type: "post",
            frontmatter: {
                title: "Archetype Title",
                date: "2020-01-01",
                draft: true,
                layout: "archetype-layout",
            },
        };

        const frontmatter = generateFrontmatter({
            title: "User Title",
            date: "2024-01-15",
            draft: false,
            layout: "user-layout",
            archetype,
        });

        expect(frontmatter).toContain('title: "User Title"');
        expect(frontmatter).toContain('date: "2024-01-15"');
        expect(frontmatter).toContain("draft: false");
        expect(frontmatter).toContain('layout: "user-layout"');
    });

    it("应该以 --- 开始和结束", () => {
        const frontmatter = generateFrontmatter({
            title: "Test",
            date: "2024-01-15",
            draft: false,
            layout: "post",
        });

        expect(frontmatter.startsWith("---")).toBe(true);
        expect(frontmatter.endsWith("---")).toBe(true);
    });

    it("应该处理数组类型的值", () => {
        const archetype: Archetype = {
            type: "post",
            frontmatter: {
                tags: ["tag1", "tag2", "tag3"],
            },
        };

        const frontmatter = generateFrontmatter({
            title: "Test",
            date: "2024-01-15",
            draft: false,
            layout: "post",
            archetype,
        });

        expect(frontmatter).toContain("tags:");
        expect(frontmatter).toContain('"tag1"');
        expect(frontmatter).toContain('"tag2"');
        expect(frontmatter).toContain('"tag3"');
    });

    it("应该处理空数组", () => {
        const archetype: Archetype = {
            type: "post",
            frontmatter: {
                tags: [],
            },
        };

        const frontmatter = generateFrontmatter({
            title: "Test",
            date: "2024-01-15",
            draft: false,
            layout: "post",
            archetype,
        });

        expect(frontmatter).toContain("tags: []");
    });
});

describe("formatDate", () => {
    it("应该格式化日期为 YYYY-MM-DD 格式", () => {
        const date = new Date(2024, 0, 15);
        expect(formatDate(date)).toBe("2024-01-15");
    });

    it("应该正确处理个位数的月份和日期", () => {
        const date = new Date(2024, 0, 5);
        expect(formatDate(date)).toBe("2024-01-05");
    });

    it("应该正确处理 12 月", () => {
        const date = new Date(2024, 11, 31);
        expect(formatDate(date)).toBe("2024-12-31");
    });
});

describe("ArchetypeManager", () => {
    let tempDir: string;
    let archetypesDir: string;
    let contentDir: string;
    let manager: ArchetypeManager;

    beforeEach(() => {
        tempDir = join(process.cwd(), "temp-archetype-test");
        archetypesDir = join(tempDir, "archetypes");
        contentDir = join(tempDir, "content");

        mkdirSync(archetypesDir, { recursive: true });
        mkdirSync(contentDir, { recursive: true });

        manager = new ArchetypeManager(archetypesDir);
    });

    afterEach(() => {
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe("getArchetype", () => {
        it("应该返回存在的原型", async () => {
            const archetypeContent = `---
layout: post
tags: ["default"]
author: Default Author
---

Default content here`;

            writeFileSync(
                join(archetypesDir, "post.md"),
                archetypeContent,
                "utf-8",
            );

            const archetype = await manager.getArchetype("post");

            expect(archetype).not.toBeNull();
            expect(archetype?.type).toBe("post");
            expect(archetype?.layout).toBe("post");
        });

        it("不存在的原型应该返回 null", async () => {
            const archetype = await manager.getArchetype("nonexistent");
            expect(archetype).toBeNull();
        });

        it("损坏的原型文件应该返回空 frontmatter", async () => {
            writeFileSync(
                join(archetypesDir, "broken.md"),
                "invalid frontmatter ---",
                "utf-8",
            );

            const archetype = await manager.getArchetype("broken");
            expect(archetype).not.toBeNull();
            expect(archetype?.type).toBe("broken");
            expect(archetype?.frontmatter).toEqual({});
        });
    });

    describe("createContent", () => {
        it("应该创建基本的内容文件", async () => {
            const result = await manager.createContent({
                type: "post",
                title: "My First Post",
                contentDir,
            });

            expect(result.success).toBe(true);
            expect(result.filePath).toBeDefined();
            expect(existsSync(result.filePath!)).toBe(true);

            const content = readFileSync(result.filePath!, "utf-8");
            expect(content).toContain('title: "My First Post"');
        });

        it("应该使用自定义日期", async () => {
            const result = await manager.createContent({
                type: "post",
                title: "Custom Date Post",
                date: "2023-06-15",
                contentDir,
            });

            expect(result.success).toBe(true);

            const content = readFileSync(result.filePath!, "utf-8");
            expect(content).toContain('date: "2023-06-15"');
        });

        it("应该创建草稿内容", async () => {
            const result = await manager.createContent({
                type: "post",
                title: "Draft Post",
                draft: true,
                contentDir,
            });

            expect(result.success).toBe(true);

            const content = readFileSync(result.filePath!, "utf-8");
            expect(content).toContain("draft: true");
        });

        it("应该使用自定义布局", async () => {
            const result = await manager.createContent({
                type: "post",
                title: "Custom Layout Post",
                layout: "special",
                contentDir,
            });

            expect(result.success).toBe(true);

            const content = readFileSync(result.filePath!, "utf-8");
            expect(content).toContain('layout: "special"');
        });

        it("应该使用自定义路径", async () => {
            const result = await manager.createContent({
                type: "page",
                title: "Custom Path Page",
                customPath: "about/index.md",
                contentDir,
            });

            expect(result.success).toBe(true);
            expect(result.filePath).toBe(join(contentDir, "about/index.md"));
        });

        it("文件已存在时应该返回错误", async () => {
            const existingPath = join(
                contentDir,
                "posts",
                "2024-01-01-existing.md",
            );
            mkdirSync(join(contentDir, "posts"), { recursive: true });
            writeFileSync(existingPath, "existing content", "utf-8");

            const result = await manager.createContent({
                type: "post",
                title: "Existing",
                date: "2024-01-01",
                contentDir,
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain("文件已存在");
        });

        it("应该使用原型配置", async () => {
            const archetypeContent = `---
layout: custom-layout
tags: ["archetype-tag"]
customField: customValue
---`;

            writeFileSync(
                join(archetypesDir, "custom.md"),
                archetypeContent,
                "utf-8",
            );

            const archetype = await manager.getArchetype("custom");
            const result = await manager.createContent({
                type: "custom",
                title: "Custom Type Post",
                archetype: archetype || undefined,
                contentDir,
            });

            expect(result.success).toBe(true);

            const content = readFileSync(result.filePath!, "utf-8");
            expect(content).toContain('layout: "custom-layout"');
            expect(content).toContain('"archetype-tag"');
            expect(content).toContain('customField: "customValue"');
        });

        it("应该为 page 类型创建正确的路径", async () => {
            const result = await manager.createContent({
                type: "page",
                title: "About Page",
                contentDir,
            });

            expect(result.success).toBe(true);
            expect(result.filePath).toContain("about");
            expect(result.filePath).toContain("index.md");
        });

        it("应该为自定义类型创建正确的路径", async () => {
            const result = await manager.createContent({
                type: "project",
                title: "My Project",
                contentDir,
            });

            expect(result.success).toBe(true);
            expect(result.filePath).toContain(join("content", "project"));
        });
    });

    describe("内容文件格式", () => {
        it("创建的文件应该包含正确的 frontmatter 分隔符", async () => {
            const result = await manager.createContent({
                type: "post",
                title: "Format Test",
                contentDir,
            });

            const content = readFileSync(result.filePath!, "utf-8");
            const parts = content.split("---");

            expect(parts.length).toBeGreaterThanOrEqual(3);
        });

        it("创建的文件应该在 frontmatter 后有空内容区域", async () => {
            const result = await manager.createContent({
                type: "post",
                title: "Content Area Test",
                contentDir,
            });

            const content = readFileSync(result.filePath!, "utf-8");
            expect(content).toContain("---\n\n");
        });
    });
});

describe("边界情况", () => {
    let tempDir: string;
    let archetypesDir: string;
    let contentDir: string;
    let manager: ArchetypeManager;

    beforeEach(() => {
        tempDir = join(process.cwd(), "temp-edge-test");
        archetypesDir = join(tempDir, "archetypes");
        contentDir = join(tempDir, "content");

        mkdirSync(archetypesDir, { recursive: true });
        mkdirSync(contentDir, { recursive: true });

        manager = new ArchetypeManager(archetypesDir);
    });

    afterEach(() => {
        if (existsSync(tempDir)) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it("应该处理非常长的标题", async () => {
        const longTitle = "A".repeat(200);
        const result = await manager.createContent({
            type: "post",
            title: longTitle,
            contentDir,
        });

        expect(result.success).toBe(true);

        const content = readFileSync(result.filePath!, "utf-8");
        expect(content).toContain(`title: "${longTitle}"`);
    });

    it("应该处理包含 emoji 的标题", () => {
        const slug = generateSlug("Hello 🎉 World 🌍");
        expect(slug).toBe("hello-world");
    });

    it("应该处理只有中文的标题", () => {
        const slug = generateSlug("这是中文标题");
        expect(slug).toBe("这是中文标题");
    });

    it("应该处理空原型目录", async () => {
        const archetype = await manager.getArchetype("any");
        expect(archetype).toBeNull();
    });
});
