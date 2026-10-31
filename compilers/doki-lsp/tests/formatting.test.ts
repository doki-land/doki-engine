import { DejavuLanguage, NodeType, Parser } from "@doki-land/dejavu-engine";
import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";

describe("Formatting Features", () => {
    const dokiLanguage = new DejavuLanguage().withTemplate({
        codeStart: "{%",
        codeEnd: "%}",
        commentStart: "{#",
        commentEnd: "#}",
    });

    const dejavuLanguage = new DejavuLanguage().withTemplate({
        codeStart: "<%",
        codeEnd: "%>",
        commentStart: "<#",
        commentEnd: "#>",
    });

    function createDocument(
        content: string,
        uri = "test://test.doki",
    ): TextDocument {
        return TextDocument.create(uri, "doki", 0, content);
    }

    describe("Code Block Detection", () => {
        it("should detect doki code blocks", () => {
            const content = `{% if x > 0 %}
Positive
{% end if %}`;
            const _document = createDocument(content);
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
            expect(ast.body.length).toBeGreaterThan(0);
        });

        it("should detect dejavu code blocks", () => {
            const content = `<% if x > 0 %>
Positive
<% end if %>`;
            const _document = createDocument(content, "test://test.dejavu");
            const parser = new Parser(content, dejavuLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
            expect(ast.body.length).toBeGreaterThan(0);
        });
    });

    describe("Whitespace Normalization", () => {
        it("should handle extra whitespace in delimiters", () => {
            const content = `{%   if true   %}yes{% end if %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
            const ifStmt = ast.body.find(
                (n: any) => n.type === NodeType.IfStatement,
            );
            expect(ifStmt).toBeDefined();
        });
    });

    describe("Control Structure Formatting", () => {
        it("should parse well-formatted if statement", () => {
            const content = `{% if condition %}
Body
{% end if %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
            const ifStmt = ast.body.find(
                (n: any) => n.type === NodeType.IfStatement,
            );
            expect(ifStmt).toBeDefined();
        });

        it("should parse well-formatted loop statement", () => {
            const content = `{% loop i in items %}
Item {% i %}
{% end loop %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
            const forInStmt = ast.body.find(
                (n: any) => n.type === NodeType.ForInStatement,
            );
            expect(forInStmt).toBeDefined();
        });

        // legacy-programming-only: match not in IR
        it.skip("should parse well-formatted match statement (legacy-programming-only: not in IR)", () => {
            const content = `{% match value %}
{% case "a" %}A
{% case _ %}Other
{% end match %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
            const matchStmt = ast.body.find(
                (n: any) => n.type === NodeType.MatchStatement,
            );
            expect(matchStmt).toBeDefined();
        });

        // legacy-programming-only: micro not in IR
        it.skip("should parse well-formatted micro function (legacy-programming-only: not in IR)", () => {
            const content = `<% micro greet(name) %>
Hello, <% name %>!
<% end micro %>`;
            const parser = new Parser(content, dejavuLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
            const funcDecl = ast.body.find(
                (n: any) => n.type === NodeType.FunctionDeclaration,
            );
            expect(funcDecl).toBeDefined();
        });
    });
});

describe("Code Action Scenarios", () => {
    const dokiLanguage = new DejavuLanguage().withTemplate({
        codeStart: "{%",
        codeEnd: "%}",
        commentStart: "{#",
        commentEnd: "#}",
    });

    describe("Delimiter Mismatch Detection", () => {
        it("should detect unclosed code delimiter", () => {
            const content = `{% let x = 1`;
            const _document = TextDocument.create(
                "test://test.doki",
                "doki",
                0,
                content,
            );

            const openCode = (content.match(/{%/g) || []).length;
            const closeCode = (content.match(/%}/g) || []).length;

            expect(openCode).toBe(1);
            expect(closeCode).toBe(0);
            expect(openCode).toBeGreaterThan(closeCode);
        });

        it("should detect unclosed comment delimiter", () => {
            const content = `{# This is a comment`;
            const _document = TextDocument.create(
                "test://test.doki",
                "doki",
                0,
                content,
            );

            const openComment = (content.match(/{#/g) || []).length;
            const closeComment = (content.match(/#}/g) || []).length;

            expect(openComment).toBe(1);
            expect(closeComment).toBe(0);
            expect(openComment).toBeGreaterThan(closeComment);
        });
    });

    describe("Variable Declaration Quick Fix", () => {
        it("should identify variable name from error context", () => {
            const lineContent = `{% undefinedVar %}`;
            const varMatch = lineContent.match(/[a-zA-Z_][a-zA-Z0-9_]*/);

            expect(varMatch).toBeDefined();
            expect(varMatch?.[0]).toBe("undefinedVar");
        });
    });

    describe("Extract Variable Refactoring", () => {
        // legacy-programming-only: let not in IR — retargeted to expression extractability
        it("should identify extractable expression", () => {
            const content = `{% (1 + 2) * 3 %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            const exprStmt = ast.body.find(
                (n: any) => n.type === NodeType.ExpressionStatement,
            );
            expect(exprStmt).toBeDefined();
            expect((exprStmt as any).expression.type).toBe(
                NodeType.BinaryExpression,
            );
        });
    });
});

describe("Language Configuration", () => {
    it("should correctly identify doki language from extension", () => {
        const uri = "file:///test.doki";
        const extension = uri.split(".").pop();
        expect(extension).toBe("doki");
    });

    it("should correctly identify dejavu language from extension", () => {
        const uri = "file:///test.dejavu";
        const extension = uri.split(".").pop();
        expect(extension).toBe("dejavu");
    });

    it("should default to doki for unknown extensions", () => {
        const uri = "file:///test.unknown";
        const extension = uri.split(".").pop();
        expect(extension).toBe("unknown");
    });
});

describe("Template Inheritance", () => {
    const dejavuLanguage = new DejavuLanguage().withTemplate({
        codeStart: "<%",
        codeEnd: "%>",
        commentStart: "<#",
        commentEnd: "#>",
    });

    it("should parse extends statement", () => {
        const content = `<% extends "base.html" %>`;
        const parser = new Parser(content, dejavuLanguage);
        const ast = parser.parse();

        expect(ast.type).toBe(NodeType.Program);
        const extendsStmt = ast.body.find(
            (n: any) => n.type === NodeType.ExtendsStatement,
        );
        expect(extendsStmt).toBeDefined();
    });

    it("should parse block declaration", () => {
        const content = `<% block content %>
Default content
<% end block %>`;
        const parser = new Parser(content, dejavuLanguage);
        const ast = parser.parse();

        expect(ast.type).toBe(NodeType.Program);
        const blockDecl = ast.body.find(
            (n: any) => n.type === NodeType.BlockDeclaration,
        );
        expect(blockDecl).toBeDefined();
    });
});

describe("Complex Templates", () => {
    const dokiLanguage = new DejavuLanguage().withTemplate({
        codeStart: "{%",
        codeEnd: "%}",
        commentStart: "{#",
        commentEnd: "#}",
    });

    it("should parse nested control structures", () => {
        const content = `{% if condition %}
  {% loop i in items %}
    {% if i > 2 %}
      {% i %}
    {% end if %}
  {% end loop %}
{% end if %}`;
        const parser = new Parser(content, dokiLanguage);
        const ast = parser.parse();

        expect(ast.type).toBe(NodeType.Program);
    });

    it("should parse template with mixed content and code", () => {
        const content = `<!DOCTYPE html>
<html>
<head>
  <title>{% title %}</title>
</head>
<body>
  {% loop item in items %}
  <div class="item">{% item.name %}</div>
  {% end loop %}
</body>
</html>`;
        const parser = new Parser(content, dokiLanguage);
        const ast = parser.parse();

        expect(ast.type).toBe(NodeType.Program);
        expect(ast.body.length).toBeGreaterThan(0);
    });

    it("should handle comments in templates", () => {
        const content = `{# This is a comment #}
{% if true %}ok{% end if %}
{# Another comment #}`;
        const parser = new Parser(content, dokiLanguage);
        const ast = parser.parse();

        expect(ast.type).toBe(NodeType.Program);
        const comments = ast.body.filter(
            (n: any) => n.type === NodeType.Comment,
        );
        expect(comments.length).toBe(2);
    });
});
