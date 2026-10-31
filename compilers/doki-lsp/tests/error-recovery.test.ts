import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
    DOKI_LANGUAGE,
    parseTemplate,
    type IrNode,
} from "../src/template/index";

describe("Error Recovery Tests", () => {
    function _createDocument(content: string): TextDocument {
        return TextDocument.create("test://test.doki", "doki", 0, content);
    }

    function parse(source: string) {
        return parseTemplate(source, DOKI_LANGUAGE);
    }

    function children(doc: { body: IrNode }): IrNode[] {
        return doc.body.type === "Template" ? doc.body.children : [];
    }

    describe("Unclosed Delimiter Recovery", () => {
        // IR parser is strict — unclosed code/comment throw
        it("should throw on unclosed code block", () => {
            expect(() => parse("{% if true")).toThrow();
        });

        it("should parse unclosed output block as text when {{ is not a code delimiter", () => {
            const doc = parse("{{ name");
            expect(doc.body.type).toBe("Template");
        });

        it("should throw on unclosed comment", () => {
            expect(() => parse("{# comment")).toThrow();
        });
    });

    describe("Partial Statement Recovery", () => {
        it("should throw on incomplete if statement", () => {
            expect(() => parse("{% if %}content{% end if %}")).toThrow();
        });

        it("should throw on incomplete loop statement", () => {
            expect(() =>
                parse("{% loop in items %}{% item %}{% end loop %}"),
            ).toThrow();
        });
    });

    describe("Mismatched End Tags", () => {
        it("should throw on mismatched end tag", () => {
            expect(() => parse("{% if true %}content{% end loop %}")).toThrow();
        });

        it("should throw on missing end tag", () => {
            expect(() => parse("{% if true %}content")).toThrow();
        });

        it("should throw on extra end tag", () => {
            expect(() => parse("{% end if %}")).toThrow();
        });
    });

    describe("Expression Error Recovery", () => {
        // With doki codeStart `{%`, `{{ ... }}` is plain text — these stay soft
        it("should parse invalid expression in {{ }} as text", () => {
            const doc = parse("{{ + }}");
            expect(doc.body.type).toBe("Template");
        });

        it("should parse incomplete filter in {{ }} as text", () => {
            const doc = parse("{{ name | }}");
            expect(doc.body.type).toBe("Template");
        });

        it("should parse invalid property access in {{ }} as text", () => {
            const doc = parse("{{ .property }}");
            expect(doc.body.type).toBe("Template");
        });

        it("should throw on invalid expression inside code delimiters", () => {
            expect(() => parse("{% + %}")).toThrow();
        });
    });

    describe("Valid Content After Error", () => {
        it("should throw on incomplete content", () => {
            expect(() =>
                parse("{% if true %}ok{% end if %}{% if "),
            ).toThrow();
        });

        it("should parse multiple valid statements", () => {
            const doc = parse(
                "{% if a %}1{% end if %}{% if b %}2{% end if %}{% if c %}3{% end if %}",
            );
            expect(doc.body.type).toBe("Template");
            expect(
                children(doc).filter((n) => n.type === "Stmt.If"),
            ).toHaveLength(3);
        });
    });

    describe("Nested Structure Recovery", () => {
        it("should handle nested if statements", () => {
            const doc = parse(`{% if a %}
  {% if b %}
    nested
  {% end if %}
{% end if %}`);
            expect(doc.body.type).toBe("Template");
        });

        it("should throw on mismatched nested end tags", () => {
            expect(() =>
                parse(`{% if a %}
  {% if b %}
    nested
  {% end if %}
{% end loop %}`),
            ).toThrow();
        });

        it("should handle nested loops", () => {
            const doc = parse(`{% loop i in items %}
  {% loop j in i %}
    {% j %}
  {% end loop %}
{% end loop %}`);
            expect(doc.body.type).toBe("Template");
        });
    });

    describe("Comment Handling", () => {
        it("should handle valid comments", () => {
            const doc = parse("{# This is a comment #}");
            expect(doc.body.type).toBe("Template");
        });

        it("should handle comments with code-looking text", () => {
            const doc = parse("{# {% if true %} #}");
            expect(doc.body.type).toBe("Template");
        });

        it("should handle multi-line comments", () => {
            const doc = parse(`{#
This is a
multi-line comment
#}`);
            expect(doc.body.type).toBe("Template");
        });
    });

    describe("Text Content", () => {
        it("should handle plain text", () => {
            const doc = parse("Hello, World!");
            expect(doc.body.type).toBe("Template");
        });

        it("should handle mixed content", () => {
            const doc = parse("Hello {% if show %}World{% end if %}!");
            expect(doc.body.type).toBe("Template");
        });

        it("should handle adjacent text blocks", () => {
            const doc = parse("{{ a }}{{ b }}{{ c }}");
            expect(doc.body.type).toBe("Template");
        });
    });

    describe("Template Inheritance Recovery", () => {
        it("should handle valid extends", () => {
            const doc = parse('{% extends "base.html" %}');
            expect(doc.body.type).toBe("Template");
        });

        it("should handle valid block", () => {
            const doc = parse("{% block content %}Default{% end block %}");
            expect(doc.body.type).toBe("Template");
        });
    });

    describe("Error Tolerance Features", () => {
        it("should continue parsing after valid statements", () => {
            const doc = parse("{% if a %}1{% end if %}{% if b %}2{% end if %}");
            expect(doc.body.type).toBe("Template");
            expect(
                children(doc).filter((n) => n.type === "Stmt.If"),
            ).toHaveLength(2);
        });

        it("should handle mixed valid content", () => {
            const doc = parse("text {% if true %}ok{% end if %} more text");
            expect(doc.body.type).toBe("Template");
        });

        it("should handle empty input", () => {
            const doc = parse("");
            expect(doc.body.type).toBe("Template");
        });

        it("should handle whitespace only input", () => {
            const doc = parse("   \n\t  ");
            expect(doc.body.type).toBe("Template");
        });
    });
});
