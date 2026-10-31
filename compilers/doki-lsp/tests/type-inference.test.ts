import { DejavuLanguage, NodeType, Parser } from "@doki-land/dejavu-engine";
import { describe, expect, it } from "vitest";

describe("Type Inference Tests", () => {
    const dokiLanguage = new DejavuLanguage().withTemplate({
        codeStart: "{%",
        codeEnd: "%}",
        commentStart: "{#",
        commentEnd: "#}",
    });

    describe("Literal Type Inference", () => {
        it("should parse number literal", () => {
            const content = "{{ 42 }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse string literal", () => {
            const content = '{{ "hello" }}';
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse boolean literal", () => {
            const content = "{{ true }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse null literal", () => {
            const content = "{{ null }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });
    });

    describe("Array Type Inference", () => {
        it("should parse array literal", () => {
            const content = "{{ [1, 2, 3] }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse empty array", () => {
            const content = "{{ [] }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse mixed array", () => {
            const content = '{{ [1, "two", true] }}';
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });
    });

    describe("Object Type Inference", () => {
        it("should parse object literal", () => {
            const content = '{{ { name: "test", value: 42 } }}';
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse empty object", () => {
            const content = "{{ {} }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });
    });

    describe("Binary Expression Type Inference", () => {
        it("should parse arithmetic operations", () => {
            const content = "{{ 1 + 2 }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse string concatenation", () => {
            const content = '{{ "hello" + " world" }}';
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse comparison operations", () => {
            const content = "{{ 1 < 2 }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse equality operations", () => {
            const content = "{{ a == b }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse range expression", () => {
            const content = "{{ 1..10 }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });
    });

    describe("Unary Expression Type Inference", () => {
        it("should parse not operator", () => {
            const content = "{{ not true }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse negation", () => {
            const content = "{{ -5 }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });
    });

    describe("Call Expression Type Inference", () => {
        it("should parse function call", () => {
            const content = "{{ len(items) }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse string function call", () => {
            const content = '{{ upper("hello") }}';
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });
    });

    describe("Member Expression Type Inference", () => {
        it("should parse property access", () => {
            const content = "{{ user.name }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse nested property access", () => {
            const content = "{{ user.address.city }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse array index access", () => {
            const content = "{{ items[0] }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });
    });

    describe("Filter Expression Type Inference", () => {
        it("should parse filter expression", () => {
            const content = "{{ name |> upper }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse chained filter expressions", () => {
            const content = "{{ name |> trim |> upper }}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });

        it("should parse filter with arguments", () => {
            const content = '{{ name |> replace("a", "b") }}';
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);
        });
    });

    // legacy-programming-only: `let` / VariableDeclaration are not in the IR template contract
    describe.skip("Variable Declaration Type Inference (legacy-programming-only: not in IR)", () => {
        it("should parse variable with number value", () => {
            const content = "{% let x = 42 %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);

            const varDecl = ast.body.find(
                (n: any) => n.type === NodeType.VariableDeclaration,
            );
            expect(varDecl).toBeDefined();
        });

        it("should parse variable with string value", () => {
            const content = '{% let name = "test" %}';
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);

            const varDecl = ast.body.find(
                (n: any) => n.type === NodeType.VariableDeclaration,
            );
            expect(varDecl).toBeDefined();
        });

        it("should parse variable with array value", () => {
            const content = "{% let items = [1, 2, 3] %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);

            const varDecl = ast.body.find(
                (n: any) => n.type === NodeType.VariableDeclaration,
            );
            expect(varDecl).toBeDefined();
        });

        it("should parse variable with object value", () => {
            const content = "{% let config = { debug: true } %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();
            expect(ast.type).toBe(NodeType.Program);

            const varDecl = ast.body.find(
                (n: any) => n.type === NodeType.VariableDeclaration,
            );
            expect(varDecl).toBeDefined();
        });
    });
});
