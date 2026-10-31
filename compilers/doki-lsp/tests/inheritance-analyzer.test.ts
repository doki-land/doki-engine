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

describe("Template Inheritance Analyzer Tests", () => {
    function _createDocument(
        content: string,
        uri = "test://test.doki",
    ): TextDocument {
        return TextDocument.create(uri, "doki", 0, content);
    }

    function parse(source: string, language = DOKI_LANGUAGE) {
        return parseTemplate(source, language);
    }

    describe("Extends Statement Analysis", () => {
        it("should parse extends statement with string literal", () => {
            const doc = parse('{% extends "base.html" %}');

            expect(doc.body.type).toBe("Template");
            expect(children(doc).length).toBe(1);

            const extendsStmt = children(doc)[0] as Extract<
                IrNode,
                { type: "Stmt.Extends" }
            >;
            expect(extendsStmt.type).toBe("Stmt.Extends");
            expect(
                extendsStmt.parent.type === "Expr.Literal" &&
                    extendsStmt.parent.value,
            ).toBe("base.html");
        });

        it("should parse extends statement with path", () => {
            const doc = parse('{% extends "layouts/main.html" %}');

            const extendsStmt = children(doc)[0] as Extract<
                IrNode,
                { type: "Stmt.Extends" }
            >;
            expect(
                extendsStmt.parent.type === "Expr.Literal" &&
                    extendsStmt.parent.value,
            ).toBe("layouts/main.html");
        });

        it("should parse extends with variable", () => {
            const doc = parse("{% extends parent %}");

            const extendsStmt = children(doc)[0];
            expect(extendsStmt.type).toBe("Stmt.Extends");
        });
    });

    describe("Block Declaration Analysis", () => {
        it("should parse empty block", () => {
            const doc = parse("{% block content %}{% end block %}");

            const blockDecl = children(doc)[0] as Extract<
                IrNode,
                { type: "Stmt.Block" }
            >;
            expect(blockDecl.type).toBe("Stmt.Block");
            expect(blockDecl.name).toBe("content");
        });

        it("should parse block with content", () => {
            const doc = parse("{% block title %}Hello World{% end block %}");

            const blockDecl = children(doc)[0] as Extract<
                IrNode,
                { type: "Stmt.Block" }
            >;
            expect(blockDecl.name).toBe("title");
            expect(blockDecl.body).toBeDefined();
        });

        it("should parse nested blocks", () => {
            const doc = parse(`{% block outer %}
{% block inner %}Nested{% end block %}
{% end block %}`);

            const outerBlock = children(doc)[0] as Extract<
                IrNode,
                { type: "Stmt.Block" }
            >;
            expect(outerBlock.name).toBe("outer");
        });

        it("should parse multiple blocks", () => {
            const doc = parse(`{% block header %}Header{% end block %}{% block content %}Content{% end block %}{% block footer %}Footer{% end block %}`);

            const blocks = children(doc).filter(
                (n) => n.type === "Stmt.Block",
            );
            expect(blocks.length).toBe(3);
        });
    });

    describe("Super Expression Analysis", () => {
        it("super() 带括号形式被引擎拒绝", () => {
            expect(() =>
                parse("{% block content %}{% super() %} Extra{% end block %}"),
            ).toThrow();
        });

        it("should parse super without parentheses", () => {
            const doc = parse("{% block content %}{% super %}{% end block %}");

            const blockDecl = children(doc)[0] as Extract<
                IrNode,
                { type: "Stmt.Block" }
            >;
            expect(blockDecl.type).toBe("Stmt.Block");
            expect(blockDecl.body.some((c) => c.type === "Stmt.Super")).toBe(
                true,
            );
        });
    });

    describe("Complete Template Inheritance", () => {
        it("should parse complete inheritance template", () => {
            const doc = parse(`{% extends "base.html" %}{% block title %}My Page{% end block %}{% block content %}<h1>Welcome</h1><p>This is my page.</p>{% end block %}`);

            const extendsStmt = children(doc).find(
                (n) => n.type === "Stmt.Extends",
            );
            expect(extendsStmt).toBeDefined();

            const blocks = children(doc).filter(
                (n) => n.type === "Stmt.Block",
            );
            expect(blocks.length).toBeGreaterThanOrEqual(2);
        });

        it("should parse template with super in block", () => {
            const doc = parse(`{% extends "base.html" %}
{% block content %}
{% super %}
<p>Additional content</p>
{% end block %}`);

            const blockDecl = children(doc).find(
                (n) => n.type === "Stmt.Block",
            );
            expect(blockDecl).toBeDefined();
        });
    });

    describe("Block in Control Flow", () => {
        it("should parse block inside if statement", () => {
            const doc = parse(`{% if showBlock %}
{% block conditional %}Content{% end block %}
{% end if %}`);

            const ifStmt = children(doc).find((n) => n.type === "Stmt.If");
            expect(ifStmt).toBeDefined();
        });

        it("should parse block inside loop", () => {
            const doc = parse(`{% loop i in items %}
{% block item %}X{% end block %}
{% end loop %}`);

            const forStmt = children(doc).find((n) => n.type === "Stmt.For");
            expect(forStmt).toBeDefined();
        });
    });

    describe("Dejavu Language Support", () => {
        it("should parse extends in dejavu syntax", () => {
            const doc = parse('<% extends "base.html" %>', DEFAULT_LANGUAGE);

            const extendsStmt = children(doc)[0];
            expect(extendsStmt.type).toBe("Stmt.Extends");
        });

        it("should parse block in dejavu syntax", () => {
            const doc = parse(
                "<% block content %>Default<% end block %>",
                DEFAULT_LANGUAGE,
            );

            const blockDecl = children(doc)[0];
            expect(blockDecl.type).toBe("Stmt.Block");
        });
    });

    describe("Block Name Extraction", () => {
        it("should extract block name correctly", () => {
            const doc = parse("{% block myBlock %}content{% end block %}");

            const blockDecl = children(doc)[0] as Extract<
                IrNode,
                { type: "Stmt.Block" }
            >;
            expect(blockDecl.name).toBe("myBlock");
        });
    });

    describe("Complex Inheritance Scenarios", () => {
        it("should parse multi-level inheritance simulation", () => {
            const childContent = `{% extends "parent.html" %}
{% block content %}
{% super %}
<p>Child content</p>
{% end block %}`;

            const doc = parse(childContent);

            const significant = children(doc).filter(
                (n) => n.type !== "Text",
            );
            expect(significant.length).toBe(2);
            expect(
                significant.some((n) => n.type === "Stmt.Extends"),
            ).toBe(true);
            expect(
                significant.some((n) => n.type === "Stmt.Block"),
            ).toBe(true);
        });

        it("should parse template with block override", () => {
            const doc = parse(
                `{% extends "base.html" %}{% block title %}My Title{% end block %}`,
            );

            const extendsStmt = children(doc).find(
                (n) => n.type === "Stmt.Extends",
            );
            expect(extendsStmt).toBeDefined();

            const blocks = children(doc).filter(
                (n) => n.type === "Stmt.Block",
            );
            expect(blocks.length).toBeGreaterThanOrEqual(1);
        });
    });
});
