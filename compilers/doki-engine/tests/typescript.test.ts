import { describe, expect, it } from "vitest";
import { DokiEngine, engine } from "../src/engine";

describe("Doki Engine TypeScript Implementation", () => {
    it("should create an instance successfully", () => {
        const instance = new DokiEngine();
        expect(instance).toBeDefined();
    });

    it("should return hello message", () => {
        const instance = new DokiEngine();
        const result = instance.hello();
        expect(result).toBe(
            "Hello from Doki Engine (TypeScript implementation)",
        );
    });

    it("should register a template", () => {
        const instance = new DokiEngine();
        const templateName = "test-template";
        const templateSource = "<h1>Hello, World!</h1>";

        instance.registerTemplate(templateName, templateSource);
    });

    it("should render static template", () => {
        const instance = new DokiEngine();
        const templateName = "test-static";
        const templateSource = "<p>Static content</p>";

        instance.registerTemplate(templateName, templateSource);

        const result = instance.renderTemplate(templateName);
        expect(result).toBe("<p>Static content</p>");
    });

    it("should throw error when rendering unregistered template", () => {
        const instance = new DokiEngine();

        expect(() => {
            instance.renderTemplate("non-existent-template");
        }).toThrow('Template "non-existent-template" not found');
    });

    it("resolves bare name via .html without alias stacking", () => {
        const instance = new DokiEngine();
        instance.registerTemplate("layout.html", "L");
        expect(instance.hasTemplate("layout")).toBe(true);
        expect(instance.hasTemplate("layout.html")).toBe(true);
        expect(instance.renderTemplate("layout")).toBe("L");
        expect(instance.listTemplateIds()).toEqual(["project:layout.html"]);
    });

    it("project root overrides theme for the same bare name", () => {
        const instance = new DokiEngine();
        instance.registerTemplate("layout.html", "THEME", "theme");
        instance.registerTemplate("layout.html", "PROJECT", "project");
        expect(instance.renderTemplate("layout")).toBe("PROJECT");
        expect(instance.renderTemplate("theme:layout")).toBe("THEME");
    });

    it("resolves relative include against the referring template", () => {
        const instance = new DokiEngine();
        // `.doki` carries the Doki `{% %}` profile (extension decides).
        instance.registerTemplate(
            "pages/child.doki",
            `{% include "./partials/head.doki" %}OK`,
        );
        instance.registerTemplate("pages/partials/head.doki", "H-");
        expect(instance.renderTemplate("pages/child")).toBe("H-OK");
    });

    it("should use singleton engine instance", () => {
        expect(engine).toBeDefined();
        expect(engine).toBeInstanceOf(DokiEngine);
    });

    it("should render template once", () => {
        const instance = new DokiEngine();
        const templateSource = "<p>Static template</p>";

        const result = instance.renderTemplateOnce(templateSource);
        expect(result).toBe("<p>Static template</p>");
    });
});

describe("Doki Engine Variable Interpolation", () => {
    it("should render simple variable", () => {
        const instance = new DokiEngine();
        const templateSource = "Hello, {% name %}!";

        const result = instance.renderTemplateOnce(templateSource, {
            name: "World",
        });
        expect(result).toBe("Hello, World!");
    });

    it("should render nested object property", () => {
        const instance = new DokiEngine();
        const templateSource = "<title>{% site.title %}</title>";

        const result = instance.renderTemplateOnce(templateSource, {
            site: { title: "My Site" },
        });
        expect(result).toBe("<title>My Site</title>");
    });

    it("should render multiple variables", () => {
        const instance = new DokiEngine();
        const templateSource = "{% greeting %}, {% name %}!";

        const result = instance.renderTemplateOnce(templateSource, {
            greeting: "Hello",
            name: "World",
        });
        expect(result).toBe("Hello, World!");
    });

    it("should handle missing variables gracefully", () => {
        const instance = new DokiEngine();
        const templateSource = "Hello, {% missing %}!";

        const result = instance.renderTemplateOnce(templateSource, {});
        // Template Contract 1.0: missing → null → empty interpolation (not the word "undefined")
        expect(result).toBe("Hello, !");
    });

    it("should render with if statement", () => {
        const instance = new DokiEngine();
        const templateSource = "{% if show %}Visible{% end if %}";

        const result = instance.renderTemplateOnce(templateSource, {
            show: true,
        });
        expect(result).toBe("Visible");
    });

    it("should render with if-else statement", () => {
        const instance = new DokiEngine();
        const templateSource =
            "{% if show %}Visible{% else %}Hidden{% end if %}";

        const result1 = instance.renderTemplateOnce(templateSource, {
            show: true,
        });
        expect(result1).toBe("Visible");

        const result2 = instance.renderTemplateOnce(templateSource, {
            show: false,
        });
        expect(result2).toBe("Hidden");
    });

    it("should render with loop statement", () => {
        const instance = new DokiEngine();
        const templateSource =
            "{% loop item in items %}{% item %}{% end loop %}";

        const result = instance.renderTemplateOnce(templateSource, {
            items: ["a", "b", "c"],
        });
        expect(result).toBe("abc");
    });
});
