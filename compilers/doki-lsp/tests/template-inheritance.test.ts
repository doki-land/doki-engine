import { describe, expect, it } from "vitest";
import {
    DEFAULT_LANGUAGE,
    parseTemplate,
    type IrNode,
} from "../src/template/index";

function parse(source: string) {
    return parseTemplate(source, DEFAULT_LANGUAGE);
}

function children(doc: { body: IrNode }): IrNode[] {
    return doc.body.type === "Template" ? doc.body.children : [];
}

describe("模板继承语法测试", () => {
    describe("extends 语句", () => {
        it("应该能正确解析 extends 语句", () => {
            const doc = parse('<% extends "base.html" %>');
            expect(children(doc)).toHaveLength(1);
            expect(children(doc)[0].type).toBe("Stmt.Extends");
        });

        it("应该能正确解析带路径的 extends 语句", () => {
            const doc = parse('<% extends "layouts/main.html" %>');
            expect(children(doc)).toHaveLength(1);
            expect(children(doc)[0].type).toBe("Stmt.Extends");
        });
    });

    describe("block 声明", () => {
        it("应该能正确解析空 block", () => {
            const doc = parse("<% block content %><% end block %>");
            expect(children(doc)).toHaveLength(1);
            expect(children(doc)[0].type).toBe("Stmt.Block");
        });

        it("应该能正确解析带内容的 block", () => {
            const doc = parse("<% block title %>Hello World<% end block %>");
            const block = children(doc).find(
                (n) => n.type === "Stmt.Block",
            ) as Extract<IrNode, { type: "Stmt.Block" }>;
            expect(block).toBeDefined();
            expect(block.name).toBe("title");
        });

        it("应该能正确解析嵌套 block", () => {
            const doc = parse(
                `<% block outer %><% block inner %>Nested<% end block %><% end block %>`,
            );
            const outerBlock = children(doc).find(
                (n) => n.type === "Stmt.Block",
            );
            expect(outerBlock).toBeDefined();
        });
    });

    describe("super 表达式", () => {
        it("super() 带括号形式被引擎拒绝", () => {
            expect(() =>
                parse("<% block title %><% super() %> - Extra<% end block %>"),
            ).toThrow();
        });

        it("应该能正确解析不带括号的 super 表达式", () => {
            const doc = parse("<% block content %><% super %><% end block %>");
            const block = children(doc).find(
                (n) => n.type === "Stmt.Block",
            ) as Extract<IrNode, { type: "Stmt.Block" }>;
            expect(block).toBeDefined();
            expect(block.body.some((c) => c.type === "Stmt.Super")).toBe(true);
        });
    });

    describe("完整模板继承", () => {
        it("应该能正确解析完整的继承模板", () => {
            const template = `<% extends "base.html" %><% block title %>My Page<% end block %><% block content %><h1>Welcome</h1><p>This is my page.</p><% end block %>`;
            const doc = parse(template);
            const extendsStmt = children(doc).find(
                (n) => n.type === "Stmt.Extends",
            );
            expect(extendsStmt).toBeDefined();
            const blocks = children(doc).filter(
                (n) => n.type === "Stmt.Block",
            );
            expect(blocks.length).toBeGreaterThanOrEqual(2);
        });
    });
});
