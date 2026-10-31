import { describe, expect, it } from "vitest";
import {
    convertFrontmatter,
    convertHexoTemplate,
    convertHugoTemplate,
    convertJekyllTemplate,
    convertTemplate,
    createMigrator,
    detectFrontmatterFormat,
    getSupportedMigrators,
    HexoMigrator,
    HugoMigrator,
    JekyllMigrator,
    mergeFrontmatter,
    normalizeFrontmatter,
    parseFrontmatter,
    parseJsonFrontmatter,
    parseTomlFrontmatter,
    parseYamlFrontmatter,
    type TemplateEngine,
    toFrontmatter,
    toJsonFrontmatter,
    toTomlFrontmatter,
    toYamlFrontmatter,
} from "../src/index";

describe("Content Migration", () => {
    describe("Frontmatter Conversion", () => {
        describe("parseYamlFrontmatter", () => {
            it("should parse YAML frontmatter", () => {
                const content = `---
title: Test Post
date: "2024-01-01"
tags:
  - rust
  - typescript
---

This is the content.`;

                const result = parseYamlFrontmatter(content);

                expect(result.data.title).toBe("Test Post");
                expect(result.data.date).toBe("2024-01-01");
                expect(result.data.tags).toEqual(["rust", "typescript"]);
                expect(result.content).toBe("This is the content.");
            });

            it("should handle empty frontmatter", () => {
                const content = `---
---

Just content here.`;

                const result = parseYamlFrontmatter(content);

                expect(result.data).toEqual({});
                expect(result.content).toBe("Just content here.");
            });
        });

        describe("parseTomlFrontmatter", () => {
            it("should parse TOML frontmatter", () => {
                const content = `+++
title = "Test Post"
date = "2024-01-01"
tags = ["rust", "typescript"]
+++

This is the content.`;

                const result = parseTomlFrontmatter(content);

                expect(result.data.title).toBe("Test Post");
                expect(result.data.date).toBe("2024-01-01");
                expect(result.data.tags).toEqual(["rust", "typescript"]);
                expect(result.content).toBe("This is the content.");
            });

            it("should return empty data for non-TOML content", () => {
                const content = "No TOML frontmatter here";

                const result = parseTomlFrontmatter(content);

                expect(result.data).toEqual({});
                expect(result.content).toBe("No TOML frontmatter here");
            });
        });

        describe("parseJsonFrontmatter", () => {
            it("should parse JSON frontmatter", () => {
                const content = `{
"title": "Test Post",
"date": "2024-01-01"
}

This is the content.`;

                const result = parseJsonFrontmatter(content);

                expect(result.data.title).toBe("Test Post");
                expect(result.data.date).toBe("2024-01-01");
                expect(result.content).toBe("This is the content.");
            });
        });

        describe("parseFrontmatter", () => {
            it("should auto-detect YAML format", () => {
                const content = `---
title: YAML Content
---

Body text.`;

                const result = parseFrontmatter(content);

                expect(result.data.title).toBe("YAML Content");
            });

            it("should auto-detect TOML format", () => {
                const content = `+++
title = "TOML Content"
+++

Body text.`;

                const result = parseFrontmatter(content);

                expect(result.data.title).toBe("TOML Content");
            });

            it("should auto-detect JSON format", () => {
                const content = `{"title": "JSON Content"}

Body text.`;

                const result = parseFrontmatter(content);

                expect(result.data.title).toBe("JSON Content");
            });

            it("should handle missing frontmatter", () => {
                const content = "Just plain content without frontmatter.";

                const result = parseFrontmatter(content);

                expect(result.data).toEqual({});
                expect(result.content).toBe(
                    "Just plain content without frontmatter.",
                );
            });
        });

        describe("toYamlFrontmatter", () => {
            it("should serialize to YAML format", () => {
                const data = { title: "Test", date: "2024-01-01" };
                const content = "Body text.";

                const result = toYamlFrontmatter(data, content);

                expect(result).toContain("---");
                expect(result).toContain("title: Test");
                expect(result).toContain("date:");
                expect(result).toContain("Body text.");
            });
        });

        describe("toTomlFrontmatter", () => {
            it("should serialize to TOML format", () => {
                const data = { title: "Test", date: "2024-01-01" };
                const content = "Body text.";

                const result = toTomlFrontmatter(data, content);

                expect(result).toContain("+++");
                expect(result).toContain('title = "Test"');
                expect(result).toContain('date = "2024-01-01"');
                expect(result).toContain("Body text.");
            });
        });

        describe("toJsonFrontmatter", () => {
            it("should serialize to JSON format", () => {
                const data = { title: "Test", date: "2024-01-01" };
                const content = "Body text.";

                const result = toJsonFrontmatter(data, content);

                expect(result).toContain('"title": "Test"');
                expect(result).toContain('"date": "2024-01-01"');
                expect(result).toContain("Body text.");
            });
        });

        describe("toFrontmatter", () => {
            it("should convert to specified format", () => {
                const data = { title: "Test" };
                const content = "Body.";

                expect(toFrontmatter(data, content, "yaml")).toContain("---");
                expect(toFrontmatter(data, content, "toml")).toContain("+++");
                expect(toFrontmatter(data, content, "json")).toContain(
                    '"title"',
                );
            });
        });

        describe("convertFrontmatter", () => {
            it("should convert YAML frontmatter to TOML", () => {
                const yamlContent = `---
title: Test Post
date: 2024-01-01
---

Content here.`;

                const result = convertFrontmatter(yamlContent, "toml");

                expect(result).toContain("+++");
                expect(result).toContain('title = "Test Post"');
                expect(result).toContain("Content here.");
            });

            it("should preserve frontmatter fields", () => {
                const content = `---
title: My Title
author: John
tags:
  - tag1
  - tag2
---

Content.`;

                const result = convertFrontmatter(content, "toml");
                const parsed = parseTomlFrontmatter(result);

                expect(parsed.data.title).toBe("My Title");
                expect(parsed.data.author).toBe("John");
                expect(parsed.data.tags).toEqual(["tag1", "tag2"]);
            });
        });

        describe("detectFrontmatterFormat", () => {
            it("should detect YAML format", () => {
                expect(detectFrontmatterFormat("---\ntitle: Test\n---\n")).toBe(
                    "yaml",
                );
            });

            it("should detect TOML format", () => {
                expect(
                    detectFrontmatterFormat('+++\ntitle = "Test"\n+++\n'),
                ).toBe("toml");
            });

            it("should detect JSON format", () => {
                expect(detectFrontmatterFormat('{"title": "Test"}\nBody')).toBe(
                    "json",
                );
            });

            it("should return null for no frontmatter", () => {
                expect(detectFrontmatterFormat("Just content")).toBeNull();
            });
        });

        describe("mergeFrontmatter", () => {
            it("should merge frontmatter data", () => {
                const existing = { title: "Old Title", author: "John" };
                const updates = { title: "New Title", date: "2024-01-01" };

                const result = mergeFrontmatter(existing, updates);

                expect(result.title).toBe("New Title");
                expect(result.author).toBe("John");
                expect(result.date).toBe("2024-01-01");
            });
        });

        describe("normalizeFrontmatter", () => {
            it("should normalize field names", () => {
                const data = {
                    permalink: "/custom-url/",
                    summary: "A summary",
                    created: "2024-01-01",
                    featured_image: "/image.jpg",
                };

                const result = normalizeFrontmatter(data);

                expect(result.url).toBe("/custom-url/");
                expect(result.description).toBe("A summary");
                expect(result.date).toBe("2024-01-01");
                expect(result.image).toBe("/image.jpg");
            });

            it("should convert categories array to single category", () => {
                const data = {
                    categories: ["tech", "programming"],
                };

                const result = normalizeFrontmatter(data);

                expect(result.category).toBe("tech");
            });
        });
    });

    describe("Template Syntax Conversion", () => {
        describe("convertHugoTemplate", () => {
            it("should convert Hugo template syntax", () => {
                const hugoTemplate = `{{ .Title }}`;

                const result = convertHugoTemplate(hugoTemplate);

                expect(result).toBe("{% page.title %}");
            });

            it("should convert .Content to content", () => {
                const hugoTemplate = `{{ .Content }}`;

                const result = convertHugoTemplate(hugoTemplate);

                expect(result).toBe("{% content %}");
            });

            it("should convert .Permalink to page.url", () => {
                const hugoTemplate = `{{ .Permalink }}`;

                const result = convertHugoTemplate(hugoTemplate);

                expect(result).toBe("{% page.url %}");
            });

            it("should convert .Site.Title to site.title", () => {
                const hugoTemplate = `{{ .Site.Title }}`;

                const result = convertHugoTemplate(hugoTemplate);

                expect(result).toBe("{% site.title %}");
            });

            it("should convert range loops", () => {
                const hugoTemplate = `{{ range .Pages }}{{ .Title }}{{ end }}`;

                const result = convertHugoTemplate(hugoTemplate);

                expect(result).toContain("{% loop page in pages %}");
                expect(result).toContain("{% endloop %}");
            });

            it("should convert partial includes", () => {
                const hugoTemplate = `{{ partial "header.html" }}`;

                const result = convertHugoTemplate(hugoTemplate);

                expect(result).toBe('{% include "header.html" %}');
            });
        });

        describe("convertHexoTemplate", () => {
            it("should convert Hexo EJS template syntax", () => {
                const hexoTemplate = `<%= page.title %>`;

                const result = convertHexoTemplate(hexoTemplate);

                expect(result).toBe("{% page.title %}");
            });

            it("should convert page.content to content", () => {
                const hexoTemplate = `<%= page.content %>`;

                const result = convertHexoTemplate(hexoTemplate);

                expect(result).toBe("{% content %}");
            });

            it("should convert config variables", () => {
                const hexoTemplate = `<%= config.title %>`;

                const result = convertHexoTemplate(hexoTemplate);

                expect(result).toBe("{% site.title %}");
            });

            it("should convert Hexo Nunjucks syntax", () => {
                const hexoTemplate = `{{ page.title }}`;

                const result = convertHexoTemplate(hexoTemplate);

                expect(result).toBe("{% page.title %}");
            });

            it("should convert for loops", () => {
                const hexoTemplate = `<% for (item of items) { %><%= item %><% } %>`;

                const result = convertHexoTemplate(hexoTemplate);

                expect(result).toContain("{% loop item in items %}");
            });
        });

        describe("convertJekyllTemplate", () => {
            it("should convert Jekyll template syntax", () => {
                const jekyllTemplate = `{{ page.title }}`;

                const result = convertJekyllTemplate(jekyllTemplate);

                expect(result).toBe("{% page.title %}");
            });

            it("should convert page.content to content", () => {
                const jekyllTemplate = `{{ page.content }}`;

                const result = convertJekyllTemplate(jekyllTemplate);

                expect(result).toBe("{% content %}");
            });

            it("should convert site variables", () => {
                const jekyllTemplate = `{{ site.title }}`;

                const result = convertJekyllTemplate(jekyllTemplate);

                expect(result).toBe("{% site.title %}");
            });

            it("should convert for loops", () => {
                const jekyllTemplate = `{% for post in site.posts %}{{ post.title }}{% endfor %}`;

                const result = convertJekyllTemplate(jekyllTemplate);

                expect(result).toContain("{% loop post in site.posts %}");
                expect(result).toContain("{% endloop %}");
            });

            it("should convert if statements", () => {
                const jekyllTemplate = `{% if page.title %}{{ page.title }}{% endif %}`;

                const result = convertJekyllTemplate(jekyllTemplate);

                expect(result).toContain("{% if");
                expect(result).toContain("page.title");
                expect(result).toContain("{% endif %}");
            });

            it("should convert include statements", () => {
                const jekyllTemplate = `{% include header.html %}`;

                const result = convertJekyllTemplate(jekyllTemplate);

                expect(result).toBe('{% include "header.html" %}');
            });
        });

        describe("convertTemplate", () => {
            it("should convert based on engine type", () => {
                expect(convertTemplate("{{ .Title }}", "hugo")).toBe(
                    "{% page.title %}",
                );
                expect(convertTemplate("<%= page.title %>", "hexo")).toBe(
                    "{% page.title %}",
                );
                expect(convertTemplate("{{ page.title }}", "jekyll")).toBe(
                    "{% page.title %}",
                );
            });

            it("should return unchanged for unknown engine", () => {
                const content = "{{ some syntax }}";

                const result = convertTemplate(
                    content,
                    "unknown" as TemplateEngine,
                );

                expect(result).toBe(content);
            });
        });
    });

    describe("Migrator Factory", () => {
        describe("createMigrator", () => {
            it("should create Hugo migrator", () => {
                const migrator = createMigrator("hugo");

                expect(migrator).toBeInstanceOf(HugoMigrator);
                expect(migrator.name).toBe("hugo");
            });

            it("should create Hexo migrator", () => {
                const migrator = createMigrator("hexo");

                expect(migrator).toBeInstanceOf(HexoMigrator);
                expect(migrator.name).toBe("hexo");
            });

            it("should create Jekyll migrator", () => {
                const migrator = createMigrator("jekyll");

                expect(migrator).toBeInstanceOf(JekyllMigrator);
                expect(migrator.name).toBe("jekyll");
            });

            it("should throw for unknown migrator", () => {
                expect(() => createMigrator("unknown" as any)).toThrow(
                    "未知的迁移器类型: unknown",
                );
            });
        });

        describe("getSupportedMigrators", () => {
            it("should return list of supported migrators", () => {
                const migrators = getSupportedMigrators();

                expect(migrators).toContain("hugo");
                expect(migrators).toContain("hexo");
                expect(migrators).toContain("jekyll");
                expect(migrators).toContain("wordpress");
            });
        });

        describe("Migrator Properties", () => {
            it("HugoMigrator should have correct properties", () => {
                const migrator = new HugoMigrator();

                expect(migrator.name).toBe("hugo");
                expect(migrator.description).toBe(
                    "Hugo 静态站点生成器内容迁移器",
                );
            });

            it("HexoMigrator should have correct properties", () => {
                const migrator = new HexoMigrator();

                expect(migrator.name).toBe("hexo");
                expect(migrator.description).toBe(
                    "Hexo 静态站点生成器内容迁移器",
                );
            });

            it("JekyllMigrator should have correct properties", () => {
                const migrator = new JekyllMigrator();

                expect(migrator.name).toBe("jekyll");
                expect(migrator.description).toBe(
                    "Jekyll 静态站点生成器内容迁移器",
                );
            });
        });
    });
});
