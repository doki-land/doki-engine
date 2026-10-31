import { describe, expect, it } from "vitest";
import { Position, Range } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
    DEFAULT_LANGUAGE,
    DOKI_LANGUAGE,
    parseTemplate,
    type IrNode,
} from "../src/template/index";

describe("LSP Core Functionality", () => {
    function createDocument(
        content: string,
        uri = "test://test.dejavu",
    ): TextDocument {
        return TextDocument.create(uri, "dejavu", 0, content);
    }

    function parse(source: string, language = DEFAULT_LANGUAGE) {
        return parseTemplate(source, language);
    }

    function children(doc: { body: IrNode }): IrNode[] {
        return doc.body.type === "Template" ? doc.body.children : [];
    }

    describe("Symbol Extraction", () => {
        it("should extract loop variables", () => {
            const content = `<% loop i in items %>
Count: <% i %>
<% end loop %>`;
            const doc = parse(content);
            expect(doc.body.type).toBe("Template");

            const forStmt = children(doc).find((n) => n.type === "Stmt.For");
            expect(forStmt).toBeDefined();
        });
    });

    describe("Error Recovery", () => {
        // IR parser is strict — unclosed delimiters throw
        it("should throw on unclosed delimiters", () => {
            expect(() => parse(`<% if true %>`)).toThrow();
        });

        it("should handle invalid syntax", () => {
            expect(() => parse(`<% + %>`)).toThrow();
        });
    });

    describe("Language Configuration", () => {
        it("should parse doki syntax", () => {
            const content = `{% if x > 0 %}
Positive
{% end if %}`;
            const doc = parse(content, DOKI_LANGUAGE);
            expect(doc.body.type).toBe("Template");
            expect(
                children(doc).some((n) => n.type === "Stmt.If"),
            ).toBe(true);
        });

        it("should parse dejavu syntax", () => {
            const content = `<% if x > 0 %>
Positive
<% end if %>`;
            const doc = parse(content, DEFAULT_LANGUAGE);
            expect(doc.body.type).toBe("Template");
            expect(
                children(doc).some((n) => n.type === "Stmt.If"),
            ).toBe(true);
        });
    });

    describe("AST Structure", () => {
        it("should parse nested expressions", () => {
            const content = `<% (1 + 2) * 3 %>`;
            const doc = parse(content);

            const expr = children(doc).find(
                (n) => n.type === "Interpolation",
            ) as Extract<IrNode, { type: "Interpolation" }>;
            expect(expr).toBeDefined();
            expect(expr.expression.type).toBe("Expr.Binary");
        });

        it("should parse member expressions", () => {
            const content = `<% user.name %>`;
            const doc = parse(content);

            const expr = children(doc).find(
                (n) => n.type === "Interpolation",
            ) as Extract<IrNode, { type: "Interpolation" }>;
            expect(expr).toBeDefined();
            expect(expr.expression.type).toBe("Expr.Member");
        });
    });

    describe("Complex Templates", () => {
        it("should parse template with mixed content", () => {
            const content = `<!DOCTYPE html>
<html>
<head>
  <title><% title %></title>
</head>
<body>
  <% loop item in items %>
  <div><% item.name %></div>
  <% end loop %>
</body>
</html>`;
            const doc = parse(content);

            expect(doc.body.type).toBe("Template");
            expect(children(doc).length).toBeGreaterThan(0);
        });

        it("should parse nested control structures", () => {
            const content = `<% if condition %>
  <% loop i in items %>
    <% if i > 5 %>
      <% i %>
    <% end if %>
  <% end loop %>
<% end if %>`;
            const doc = parse(content);

            expect(doc.body.type).toBe("Template");
        });
    });

    describe("TextDocument Integration", () => {
        it("should create text document correctly", () => {
            const content = `<% if true %>ok<% end if %>`;
            const document = createDocument(content);

            expect(document.uri).toBe("test://test.dejavu");
            expect(document.languageId).toBe("dejavu");
            expect(document.version).toBe(0);
            expect(document.getText()).toBe(content);
            expect(document.lineCount).toBe(1);
        });

        it("should handle position conversion", () => {
            const content = `line1
line2
line3`;
            const document = createDocument(content);

            const pos = Position.create(1, 2);
            const offset = document.offsetAt(pos);
            expect(offset).toBe(8);

            const backPos = document.positionAt(offset);
            expect(backPos.line).toBe(1);
            expect(backPos.character).toBe(2);
        });

        it("should get line content", () => {
            const content = `first line
second line`;
            const document = createDocument(content);

            expect(document.getText(Range.create(0, 0, 0, 10))).toBe(
                "first line",
            );
        });
    });
});
