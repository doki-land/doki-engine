import { DejavuLanguage, NodeType, Parser } from "@doki-land/dejavu-engine";
import { describe, expect, it } from "vitest";
import { Position, Range } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

describe("LSP Core Functionality", () => {
    const dejavuLanguage = new DejavuLanguage().withTemplate({
        codeStart: "<%",
        codeEnd: "%>",
        commentStart: "<#",
        commentEnd: "#>",
    });

    const dokiLanguage = new DejavuLanguage().withTemplate({
        codeStart: "{%",
        codeEnd: "%}",
        commentStart: "{#",
        commentEnd: "#}",
    });

    function createDocument(
        content: string,
        uri = "test://test.dejavu",
    ): TextDocument {
        return TextDocument.create(uri, "dejavu", 0, content);
    }

    describe("Symbol Extraction", () => {
        // legacy-programming-only: let / VariableDeclaration not in IR
        it.skip("should extract variable declarations (legacy-programming-only: not in IR)", () => {
            const content = `<% let x = 42 %>
<% let name = "hello" %>`;
            const _document = createDocument(content);
            const parser = new Parser(content, dejavuLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
            expect(ast.body.length).toBeGreaterThan(0);
        });

        // legacy-programming-only: micro / FunctionDeclaration not in IR
        it.skip("should extract function declarations (legacy-programming-only: not in IR)", () => {
            const content = `<% micro greet(name) %>
Hello, <% name %>!
<% end micro %>`;
            const _document = createDocument(content);
            const parser = new Parser(content, dejavuLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);

            const funcDecl = ast.body.find(
                (n: any) => n.type === NodeType.FunctionDeclaration,
            );
            expect(funcDecl).toBeDefined();
            expect(funcDecl.name.name).toBe("greet");
            expect(funcDecl.params.length).toBe(1);
        });

        it("should extract loop variables", () => {
            const content = `<% loop i in items %>
Count: <% i %>
<% end loop %>`;
            const _document = createDocument(content);
            const parser = new Parser(content, dejavuLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);

            const forInStmt = ast.body.find(
                (n: any) => n.type === NodeType.ForInStatement,
            );
            expect(forInStmt).toBeDefined();
        });
    });

    describe("Scope Analysis", () => {
        // legacy-programming-only: micro not in IR
        it.skip("should create function scope (legacy-programming-only: not in IR)", () => {
            const content = `<% micro add(a, b) %>
<% a + b %>
<% end micro %>`;
            const _document = createDocument(content);
            const parser = new Parser(content, dejavuLanguage);
            const ast = parser.parse();

            const funcDecl = ast.body.find(
                (n: any) => n.type === NodeType.FunctionDeclaration,
            );
            expect(funcDecl).toBeDefined();
            expect(funcDecl.params).toHaveLength(2);
        });

        // IR loop form is `loop item in iterable` only (no index tuple)
        it.skip("should create loop scope (legacy-programming-only: indexed loop not in IR)", () => {
            const content = `<% loop (index, item) in items %>
<% index %>: <% item %>
<% end loop %>`;
            const _document = createDocument(content);
            const parser = new Parser(content, dejavuLanguage);
            const ast = parser.parse();

            const forInStmt = ast.body.find(
                (n: any) => n.type === NodeType.ForInStatement,
            );
            expect(forInStmt).toBeDefined();
            expect(Array.isArray(forInStmt.left)).toBe(true);
        });
    });

    describe("Error Recovery", () => {
        // IR parser is strict — unclosed delimiters throw (legacy soft-recovery skipped)
        it("should throw on unclosed delimiters", () => {
            const content = `<% if true %>`;
            const parser = new Parser(content, dejavuLanguage);
            expect(() => parser.parse()).toThrow();
        });

        it("should handle invalid syntax", () => {
            const content = `<% + %>`;

            expect(() => {
                const parser = new Parser(content, dejavuLanguage);
                parser.parse();
            }).toThrow();
        });
    });

    describe("Language Configuration", () => {
        it("should parse doki syntax", () => {
            const content = `{% if x > 0 %}
Positive
{% end if %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
            expect(
                ast.body.some((n: any) => n.type === NodeType.IfStatement),
            ).toBe(true);
        });

        it("should parse dejavu syntax", () => {
            const content = `<% if x > 0 %>
Positive
<% end if %>`;
            const parser = new Parser(content, dejavuLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
            expect(
                ast.body.some((n: any) => n.type === NodeType.IfStatement),
            ).toBe(true);
        });
    });

    describe("AST Structure", () => {
        // IR spans not populated yet
        it.skip("should have correct location info (IR spans not populated yet)", () => {
            const content = `<% name %>`;
            const parser = new Parser(content, dejavuLanguage);
            const ast = parser.parse();

            const expr = ast.body.find(
                (n: any) => n.type === NodeType.ExpressionStatement,
            );
            expect(expr).toBeDefined();
            expect(expr.loc).toBeDefined();
            expect(expr.loc.start.line).toBe(1);
        });

        it("should parse nested expressions", () => {
            const content = `<% (1 + 2) * 3 %>`;
            const parser = new Parser(content, dejavuLanguage);
            const ast = parser.parse();

            const exprStmt = ast.body.find(
                (n: any) => n.type === NodeType.ExpressionStatement,
            );
            expect(exprStmt).toBeDefined();
            expect((exprStmt as any).expression.type).toBe(
                NodeType.BinaryExpression,
            );
        });

        it("should parse member expressions", () => {
            const content = `<% user.name %>`;
            const parser = new Parser(content, dejavuLanguage);
            const ast = parser.parse();

            const exprStmt = ast.body.find(
                (n: any) => n.type === NodeType.ExpressionStatement,
            );
            expect(exprStmt).toBeDefined();
            expect(exprStmt.expression.type).toBe(NodeType.MemberExpression);
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
            const parser = new Parser(content, dejavuLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
            expect(ast.body.length).toBeGreaterThan(0);
        });

        it("should parse nested control structures", () => {
            const content = `<% if condition %>
  <% loop i in items %>
    <% if i > 5 %>
      <% i %>
    <% end if %>
  <% end loop %>
<% end if %>`;
            const parser = new Parser(content, dejavuLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
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
