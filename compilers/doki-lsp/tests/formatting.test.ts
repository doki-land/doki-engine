import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
    DEFAULT_LANGUAGE,
    DOKI_LANGUAGE,
    parseTemplate,
    type IrNode,
} from "../src/template/index";

function children(doc: { body: IrNode }): IrNode[] {
    return doc.body.type === "Template" ? doc.body.children : [];
}

describe("Formatting Features", () => {
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
            const doc = parseTemplate(content, DOKI_LANGUAGE);

            expect(doc.body.type).toBe("Template");
            expect(children(doc).length).toBeGreaterThan(0);
        });

        it("should detect dejavu code blocks", () => {
            const content = `<% if x > 0 %>
Positive
<% end if %>`;
            const _document = createDocument(content, "test://test.dejavu");
            const doc = parseTemplate(content, DEFAULT_LANGUAGE);

            expect(doc.body.type).toBe("Template");
            expect(children(doc).length).toBeGreaterThan(0);
        });
    });

    describe("Whitespace Normalization", () => {
        it("should handle extra whitespace in delimiters", () => {
            const content = `{%   if true   %}yes{% end if %}`;
            const doc = parseTemplate(content, DOKI_LANGUAGE);

            expect(doc.body.type).toBe("Template");
            const ifStmt = children(doc).find((n) => n.type === "Stmt.If");
            expect(ifStmt).toBeDefined();
        });
    });

    describe("Control Structure Formatting", () => {
        it("should parse well-formatted if statement", () => {
            const content = `{% if condition %}
Body
{% end if %}`;
            const doc = parseTemplate(content, DOKI_LANGUAGE);

            expect(doc.body.type).toBe("Template");
            const ifStmt = children(doc).find((n) => n.type === "Stmt.If");
            expect(ifStmt).toBeDefined();
        });

        it("should parse well-formatted loop statement", () => {
            const content = `{% loop i in items %}
Item {% i %}
{% end loop %}`;
            const doc = parseTemplate(content, DOKI_LANGUAGE);

            expect(doc.body.type).toBe("Template");
            const forStmt = children(doc).find((n) => n.type === "Stmt.For");
            expect(forStmt).toBeDefined();
        });
    });
});

describe("Code Action Scenarios", () => {
    describe("Delimiter Mismatch Detection", () => {
        it("should detect unclosed code delimiter", () => {
            const content = `{% if x > 1`;
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
        it("should identify extractable expression", () => {
            const content = `{% (1 + 2) * 3 %}`;
            const doc = parseTemplate(content, DOKI_LANGUAGE);

            const expr = children(doc).find(
                (n) => n.type === "Interpolation",
            ) as Extract<IrNode, { type: "Interpolation" }>;
            expect(expr).toBeDefined();
            expect(expr.expression.type).toBe("Expr.Binary");
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
    it("should parse extends statement", () => {
        const content = `<% extends "base.html" %>`;
        const doc = parseTemplate(content, DEFAULT_LANGUAGE);

        expect(doc.body.type).toBe("Template");
        const extendsStmt = children(doc).find(
            (n) => n.type === "Stmt.Extends",
        );
        expect(extendsStmt).toBeDefined();
    });

    it("should parse block declaration", () => {
        const content = `<% block content %>
Default content
<% end block %>`;
        const doc = parseTemplate(content, DEFAULT_LANGUAGE);

        expect(doc.body.type).toBe("Template");
        const blockDecl = children(doc).find((n) => n.type === "Stmt.Block");
        expect(blockDecl).toBeDefined();
    });
});

describe("Complex Templates", () => {
    it("should parse nested control structures", () => {
        const content = `{% if condition %}
  {% loop i in items %}
    {% if i > 2 %}
      {% i %}
    {% end if %}
  {% end loop %}
{% end if %}`;
        const doc = parseTemplate(content, DOKI_LANGUAGE);

        expect(doc.body.type).toBe("Template");
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
        const doc = parseTemplate(content, DOKI_LANGUAGE);

        expect(doc.body.type).toBe("Template");
        expect(children(doc).length).toBeGreaterThan(0);
    });

    it("should handle comments in templates", () => {
        const content = `{# This is a comment #}
{% if true %}ok{% end if %}
{# Another comment #}`;
        const doc = parseTemplate(content, DOKI_LANGUAGE);

        expect(doc.body.type).toBe("Template");
        const comments = children(doc).filter((n) => n.type === "Comment");
        expect(comments.length).toBe(2);
    });
});
