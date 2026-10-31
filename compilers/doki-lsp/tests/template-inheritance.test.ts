import { DejavuLanguage, NodeType, Parser } from "@doki-land/dejavu-engine";
import { describe, expect, it } from "vitest";

const dejavuLanguage = new DejavuLanguage().withTemplate({
    codeStart: "<%",
    codeEnd: "%>",
    commentStart: "<#",
    commentEnd: "#>",
});

function parse(source: string) {
    return new Parser(source, dejavuLanguage).parse();
}

describe("模板继承语法测试", () => {
    describe("extends 语句", () => {
        it("应该能正确解析 extends 语句", () => {
            const ast = parse('<% extends "base.html" %>');
            expect(ast.body).toHaveLength(1);
            expect(ast.body[0].type).toBe(NodeType.ExtendsStatement);
        });

        it("应该能正确解析带路径的 extends 语句", () => {
            const ast = parse('<% extends "layouts/main.html" %>');
            expect(ast.body).toHaveLength(1);
            expect(ast.body[0].type).toBe(NodeType.ExtendsStatement);
        });
    });

    describe("block 声明", () => {
        it("应该能正确解析空 block", () => {
            const ast = parse("<% block content %><% end block %>");
            expect(ast.body).toHaveLength(1);
            expect(ast.body[0].type).toBe(NodeType.BlockDeclaration);
        });

        it("应该能正确解析带内容的 block", () => {
            const ast = parse("<% block title %>Hello World<% end block %>");
            const block = ast.body.find(
                (n) => n.type === NodeType.BlockDeclaration,
            );
            expect(block).toBeDefined();
            expect((block as any).name.name).toBe("title");
        });

        it("应该能正确解析嵌套 block", () => {
            const ast = parse(
                `<% block outer %><% block inner %>Nested<% end block %><% end block %>`,
            );
            const outerBlock = ast.body.find(
                (n) => n.type === NodeType.BlockDeclaration,
            );
            expect(outerBlock).toBeDefined();
        });
    });

    // legacy-programming-only / not in IR template contract: prepend / append
    describe.skip("prepend 语句 (legacy-programming-only: not in IR)", () => {
        it("应该能正确解析 prepend 语句", () => {
            const ast = parse(
                "<% prepend sidebar %>Extra content<% end block %>",
            );
            const prepend = ast.body.find((n) => n.type === "PrependStatement");
            expect(prepend).toBeDefined();
        });
    });

    describe.skip("append 语句 (legacy-programming-only: not in IR)", () => {
        it("应该能正确解析 append 语句", () => {
            const ast = parse(
                "<% append footer %>Copyright 2024<% end block %>",
            );
            const append = ast.body.find((n) => n.type === "AppendStatement");
            expect(append).toBeDefined();
        });
    });

    describe("super 表达式", () => {
        it("应该能正确解析 super() 表达式", () => {
            const ast = parse(
                "<% block title %><% super() %> - Extra<% end block %>",
            );
            const block = ast.body.find(
                (n) => n.type === NodeType.BlockDeclaration,
            );
            expect(block).toBeDefined();
        });

        it("应该能正确解析不带括号的 super 表达式", () => {
            const ast = parse("<% block content %><% super %><% end block %>");
            const block = ast.body.find(
                (n) => n.type === NodeType.BlockDeclaration,
            );
            expect(block).toBeDefined();
        });
    });

    describe("完整模板继承", () => {
        it("应该能正确解析完整的继承模板", () => {
            const template = `<% extends "base.html" %><% block title %>My Page<% end block %><% block content %><h1>Welcome</h1><p>This is my page.</p><% end block %>`;
            const ast = parse(template);
            const extendsStmt = ast.body.find(
                (n) => n.type === NodeType.ExtendsStatement,
            );
            expect(extendsStmt).toBeDefined();
            const blocks = ast.body.filter(
                (n) => n.type === NodeType.BlockDeclaration,
            );
            expect(blocks.length).toBeGreaterThanOrEqual(2);
        });

        // legacy-programming-only / not in IR: prepend + append
        it.skip("应该能正确解析带 prepend 和 append 的模板 (legacy-programming-only: not in IR)", () => {
            const template = `<% extends "base.html" %><% prepend head %><meta name="description"><% end block %><% append scripts %><script src="custom.js"></script><% end block %>`;
            const ast = parse(template);
            const extendsStmt = ast.body.find(
                (n) => n.type === NodeType.ExtendsStatement,
            );
            expect(extendsStmt).toBeDefined();
        });
    });
});
