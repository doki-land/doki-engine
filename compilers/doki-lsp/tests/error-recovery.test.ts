import { DejavuLanguage, NodeType, Parser } from "@doki-land/dejavu-engine";
import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";

describe("Error Recovery Tests", () => {
    const dokiLanguage = new DejavuLanguage().withTemplate({
        codeStart: "{%",
        codeEnd: "%}",
        commentStart: "{#",
        commentEnd: "#}",
    });

    function _createDocument(content: string): TextDocument {
        return TextDocument.create("test://test.doki", "doki", 0, content);
    }

    describe("Unclosed Delimiter Recovery", () => {
        // IR parser is strict — unclosed code/comment throw
        it("should throw on unclosed code block", () => {
            const content = "{% if true";
            const parser = new Parser(content, dokiLanguage);
            expect(() => parser.parse()).toThrow();
        });

        it("should parse unclosed output block as text when {{ is not a code delimiter", () => {
            const content = "{{ name";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should throw on unclosed comment", () => {
            const content = "{# comment";
            const parser = new Parser(content, dokiLanguage);
            expect(() => parser.parse()).toThrow();
        });
    });

    describe("Partial Statement Recovery", () => {
        it("should throw on incomplete if statement", () => {
            const content = "{% if %}content{% end if %}";
            const parser = new Parser(content, dokiLanguage);
            expect(() => parser.parse()).toThrow();
        });

        it("should throw on incomplete loop statement", () => {
            const content = "{% loop in items %}{% item %}{% end loop %}";
            const parser = new Parser(content, dokiLanguage);
            expect(() => parser.parse()).toThrow();
        });

        // legacy-programming-only: micro not in IR
        it.skip("should parse function declaration (legacy-programming-only: not in IR)", () => {
            const content = "{% micro test() %}body{% end micro %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });
    });

    describe("Mismatched End Tags", () => {
        it("should throw on mismatched end tag", () => {
            const content = "{% if true %}content{% end loop %}";
            const parser = new Parser(content, dokiLanguage);
            expect(() => parser.parse()).toThrow();
        });

        it("should throw on missing end tag", () => {
            const content = "{% if true %}content";
            const parser = new Parser(content, dokiLanguage);
            expect(() => parser.parse()).toThrow();
        });

        it("should throw on extra end tag", () => {
            const content = "{% end if %}";
            const parser = new Parser(content, dokiLanguage);
            expect(() => parser.parse()).toThrow();
        });
    });

    describe("Expression Error Recovery", () => {
        // With doki codeStart `{%`, `{{ ... }}` is plain text — these stay soft
        it("should parse invalid expression in {{ }} as text", () => {
            const content = "{{ + }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse incomplete filter in {{ }} as text", () => {
            const content = "{{ name | }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse invalid property access in {{ }} as text", () => {
            const content = "{{ .property }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should throw on invalid expression inside code delimiters", () => {
            const content = "{% + %}";
            const parser = new Parser(content, dokiLanguage);
            expect(() => parser.parse()).toThrow();
        });
    });

    describe("Valid Content After Error", () => {
        it("should throw on incomplete content", () => {
            const content = "{% if true %}ok{% end if %}{% if ";
            const parser = new Parser(content, dokiLanguage);
            expect(() => parser.parse()).toThrow();
        });

        it("should parse multiple valid statements", () => {
            const content =
                "{% if a %}1{% end if %}{% if b %}2{% end if %}{% if c %}3{% end if %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
            expect(
                ast.body.filter((n: any) => n.type === NodeType.IfStatement),
            ).toHaveLength(3);
        });
    });

    describe("Nested Structure Recovery", () => {
        it("should handle nested if statements", () => {
            const content = `{% if a %}
  {% if b %}
    nested
  {% end if %}
{% end if %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should throw on mismatched nested end tags", () => {
            const content = `{% if a %}
  {% if b %}
    nested
  {% end if %}
{% end loop %}`;
            const parser = new Parser(content, dokiLanguage);
            expect(() => parser.parse()).toThrow();
        });

        it("should handle nested loops", () => {
            const content = `{% loop i in items %}
  {% loop j in i %}
    {% j %}
  {% end loop %}
{% end loop %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });
    });

    describe("Comment Handling", () => {
        it("should handle valid comments", () => {
            const content = "{# This is a comment #}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should handle comments with code-looking text", () => {
            const content = "{# {% if true %} #}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should handle multi-line comments", () => {
            const content = `{# 
This is a 
multi-line comment 
#}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });
    });

    describe("Text Content", () => {
        it("should handle plain text", () => {
            const content = "Hello, World!";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should handle mixed content", () => {
            const content = "Hello {% if show %}World{% end if %}!";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should handle adjacent text blocks", () => {
            const content = "{{ a }}{{ b }}{{ c }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });
    });

    // legacy-programming-only: match / while / namespace / using / prepend / append
    describe.skip("Match Statement Recovery (legacy-programming-only: not in IR)", () => {
        it("should handle valid match statement", () => {
            const content = `{% match x %}
{% case 1 %}One
{% case _ %}Other
{% end match %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse match without cases gracefully", () => {
            const content = "{% match x %}{% end match %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse match without default case gracefully", () => {
            const content = `{% match x %}
{% case 1 %}One
{% end match %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });
    });

    describe("Template Inheritance Recovery", () => {
        it("should handle valid extends", () => {
            const content = '{% extends "base.html" %}';
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should handle valid block", () => {
            const content = "{% block content %}Default{% end block %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it.skip("should handle valid prepend (legacy-programming-only: not in IR)", () => {
            const content = "{% prepend head %}<meta>{% end block %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it.skip("should handle valid append (legacy-programming-only: not in IR)", () => {
            const content = "{% append scripts %}<script>{% end block %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });
    });

    describe.skip("While Statement Recovery (legacy-programming-only: not in IR)", () => {
        it("should handle valid while statement", () => {
            const content =
                "{% while x > 0 %}{{ x }}{% let x = x - 1 %}{% end while %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse while without condition gracefully", () => {
            const content = "{% while %}body{% end while %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse while without end gracefully", () => {
            const content = "{% while true %}body";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });
    });

    describe.skip("Namespace Recovery (legacy-programming-only: not in IR)", () => {
        it("should handle valid namespace", () => {
            const content = `{% namespace utils %}
{% micro helper() %}help{% end micro %}
{% end namespace %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should throw on namespace without name", () => {
            const content = "{% namespace %}body{% end namespace %}";
            const parser = new Parser(content, dokiLanguage);
            expect(() => parser.parse()).toThrow();
        });
    });

    describe.skip("Using Statement Recovery (legacy-programming-only: not in IR)", () => {
        it("should handle valid using statement", () => {
            const content = "{% using utils %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should throw on using without module", () => {
            const content = "{% using %}";
            const parser = new Parser(content, dokiLanguage);
            expect(() => parser.parse()).toThrow();
        });
    });

    describe("Error Tolerance Features", () => {
        it("should continue parsing after valid statements", () => {
            const content = "{% if a %}1{% end if %}{% if b %}2{% end if %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
            expect(
                ast.body.filter((n: any) => n.type === NodeType.IfStatement),
            ).toHaveLength(2);
        });

        it("should handle mixed valid content", () => {
            const content = "text {% if true %}ok{% end if %} more text";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should handle empty input", () => {
            const content = "";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should handle whitespace only input", () => {
            const content = "   \n\t  ";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });
    });
});
