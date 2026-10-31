import { beforeEach, describe, expect, it } from "vitest";
import { DOKI_LANGUAGE, DokiEngine } from "../src/engine";
import { getPaginationUrl, paginate } from "../src/pagination";
import {
    buildTaxonomyPages,
    extractTaxonomies,
    getTaxonomyUrl,
} from "../src/taxonomy";
import type { Content } from "../src/types";

describe("Doki Engine Template Syntax", () => {
    let engine: DokiEngine;

    beforeEach(() => {
        engine = new DokiEngine();
    });

    it("should render simple variable", () => {
        const template = "Hello, {% name %}!";
        const result = engine.renderTemplateOnce(template, { name: "World" });
        expect(result).toBe("Hello, World!");
    });

    it("should render with if statement", () => {
        const template = "{% if show %}Visible{% end if %}";
        const result = engine.renderTemplateOnce(template, { show: true });
        expect(result).toBe("Visible");
    });

    it("should render with loop statement", () => {
        const template = "{% loop item in items %}{% item %}{% end loop %}";
        const result = engine.renderTemplateOnce(template, {
            items: ["a", "b", "c"],
        });
        expect(result).toBe("abc");
    });
});

describe("Taxonomy System", () => {
    const createMockContent = (overrides: Partial<Content> = {}): Content => ({
        sourcePath: "/test.md",
        relativePath: "test.md",
        url: "/test/",
        frontmatter: {
            title: "Test",
            date: "2024-01-01",
            tags: ["tag1", "tag2"],
            category: "tech",
        },
        rawContent: "Test content",
        html: "<p>Test content</p>",
        variables: {
            title: "Test",
            tags: ["tag1", "tag2"],
            category: "tech",
        },
        lang: "en",
        baseName: "test",
        isDefaultLang: true,
        ...overrides,
    });

    it("should extract taxonomies from content", () => {
        const contents: Content[] = [
            createMockContent({
                frontmatter: { tags: ["rust", "programming"] },
                variables: { tags: ["rust", "programming"] },
            }),
            createMockContent({
                frontmatter: { tags: ["typescript", "programming"] },
                variables: { tags: ["typescript", "programming"] },
            }),
        ];

        const taxonomyConfig = {
            tags: {},
            categories: {},
        };

        const collection = extractTaxonomies(contents, taxonomyConfig);
        expect(collection.taxonomies.has("tags")).toBe(true);
    });

    it("should build taxonomy pages", () => {
        const contents: Content[] = [
            createMockContent({
                frontmatter: { tags: ["rust"] },
                variables: { tags: ["rust"] },
            }),
        ];

        const taxonomyConfig = { tags: {} };
        const collection = extractTaxonomies(contents, taxonomyConfig);
        const pages = buildTaxonomyPages(collection);

        expect(pages.length).toBeGreaterThan(0);
    });

    it("should generate taxonomy URL", () => {
        const url = getTaxonomyUrl("tags", "rust");
        expect(url).toBe("/tags/rust/");
    });
});

describe("Pagination", () => {
    const createItems = (count: number): number[] =>
        Array.from({ length: count }, (_, i) => i + 1);

    it("should paginate items", () => {
        const items = createItems(25);
        const pages = paginate(items, 10, (page) => `/page/${page}/`);

        expect(pages.pages).toHaveLength(3);
        expect(pages.pages[0].items).toHaveLength(10);
        expect(pages.pages[0].index).toBe(1);
        expect(pages.pages[2].items).toHaveLength(5);
    });

    it("should handle empty items", () => {
        const pages = paginate([], 10, (page) => `/page/${page}/`);
        expect(pages.pages).toHaveLength(0);
    });

    it("should handle items less than page size", () => {
        const items = createItems(5);
        const pages = paginate(items, 10, (page) => `/page/${page}/`);

        expect(pages.pages).toHaveLength(1);
        expect(pages.pages[0].items).toHaveLength(5);
    });

    it("should generate pagination URL", () => {
        const url = getPaginationUrl("/tags/rust/", 2);
        expect(url).toBe("/tags/rust/page/2/");
    });
});

describe("Doki Language Configuration", () => {
    it("should use correct delimiters", () => {
        expect(DOKI_LANGUAGE.template.codeStart).toBe("{%");
        expect(DOKI_LANGUAGE.template.codeEnd).toBe("%}");
        expect(DOKI_LANGUAGE.template.commentStart).toBe("{#");
        expect(DOKI_LANGUAGE.template.commentEnd).toBe("#}");
    });

    it("parse(source, DOKI_LANGUAGE) uses {% %} (not default <% %>)", async () => {
        const { DejavuEngine } = await import("@doki-land/dejavu-engine");
        const engine = new DejavuEngine();
        // Explicit language arg — no setLanguage / mutable engine state.
        const ir = engine.parse("{% if true %}ok{% end if %}", DOKI_LANGUAGE);
        const kids = ir.body.type === "Template" ? ir.body.children : [ir.body];
        expect(kids.some((n: { type: string }) => n.type === "Stmt.If")).toBe(
            true,
        );

        // Without language, default <% %> leaves {% %} as text.
        const plain = engine.parse("{% if true %}ok{% end if %}");
        const plainKids =
            plain.body.type === "Template" ? plain.body.children : [plain.body];
        expect(
            plainKids.every((n: { type: string }) => n.type === "Text"),
        ).toBe(true);
    });

    it("renderSource(source, ctx, DOKI_LANGUAGE) uses {% %} without setLanguage", async () => {
        const { DejavuEngine } = await import("@doki-land/dejavu-engine");
        const engine = new DejavuEngine();
        const out = engine.renderSource(
            "Hi {% name %}!",
            { name: "Doki" },
            DOKI_LANGUAGE,
        );
        expect(out).toBe("Hi Doki!");

        // Default delimiters leave {% %} as literal text.
        const plain = engine.renderSource("Hi {% name %}!", { name: "Doki" });
        expect(plain).toBe("Hi {% name %}!");
    });
});
