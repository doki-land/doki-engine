import { describe, expect, it } from "vitest";
import {
    DEFAULT_LANGUAGE,
    DOKI_LANGUAGE,
    parseTemplate,
    type IrNode,
} from "../src/template/index";

function parse(source: string, language = DEFAULT_LANGUAGE) {
    return parseTemplate(source, language);
}

function children(doc: { body: IrNode }): IrNode[] {
    return doc.body.type === "Template" ? doc.body.children : [];
}

describe("Doki LSP Parser Integration", () => {
    describe("Expressions", () => {
        it("should parse binary expressions", () => {
            const doc = parse("Result: <% 1 + 2 %>");
            expect(doc.body.type).toBe("Template");
            const expr = children(doc).find((n) => n.type === "Interpolation");
            expect(expr).toBeDefined();
            expect(
                expr &&
                    expr.type === "Interpolation" &&
                    expr.expression.type,
            ).toBe("Expr.Binary");
        });

        it("should parse function calls", () => {
            const doc = parse("Result: <% foo(1, 2) %>");
            expect(doc.body.type).toBe("Template");
            const expr = children(doc).find((n) => n.type === "Interpolation");
            expect(
                expr &&
                    expr.type === "Interpolation" &&
                    expr.expression.type,
            ).toBe("Expr.Call");
        });

        it("should parse filter pipes", () => {
            const doc = parse("<% name |> upper %>");
            const expr = children(doc).find(
                (n) => n.type === "Interpolation",
            ) as Extract<IrNode, { type: "Interpolation" }>;
            expect(expr.expression.type).toBe("Expr.Pipe");
            expect(
                expr.expression.type === "Expr.Pipe" && expr.expression.filter,
            ).toBe("upper");
        });
    });

    describe("Mixed Content", () => {
        it("should parse template with text and code", () => {
            const doc = parse("Hello <% name %>!");
            expect(doc.body.type).toBe("Template");
            expect(children(doc).some((n) => n.type === "Text")).toBe(true);
            expect(
                children(doc).some((n) => n.type === "Interpolation"),
            ).toBe(true);
        });
    });
});

describe("Control Flow Parsing", () => {
    describe("If Statements", () => {
        it("should parse simple if statement", () => {
            const source = `
<% if x > 0 %>
Positive
<% end if %>
`;
            const doc = parse(source);
            expect(doc.body.type).toBe("Template");
            expect(
                children(doc).some((n) => n.type === "Stmt.If"),
            ).toBe(true);
        });

        it("should parse if-else statement", () => {
            const source = `
<% if x > 0 %>
Positive
<% else %>
Non-positive
<% end if %>
`;
            const doc = parse(source);
            const ifStmt = children(doc).find(
                (n) => n.type === "Stmt.If",
            ) as Extract<IrNode, { type: "Stmt.If" }>;
            expect(ifStmt).toBeDefined();
            expect(ifStmt.alternate).toBeDefined();
        });

        it("should parse if-elseif-else statement", () => {
            const source = `
<% if x > 0 %>
Positive
<% else if x < 0 %>
Negative
<% else %>
Zero
<% end if %>
`;
            const doc = parse(source);
            const ifStmt = children(doc).find(
                (n) => n.type === "Stmt.If",
            ) as Extract<IrNode, { type: "Stmt.If" }>;
            expect(ifStmt.elseIfs.length).toBeGreaterThanOrEqual(1);
            expect(ifStmt.alternate).toBeDefined();
        });
    });

    describe("Loop Statements", () => {
        it("should parse collection loop", () => {
            const source = `
<% loop item in items %>
Item: <% item %>
<% end loop %>
`;
            const doc = parse(source);
            const forStmt = children(doc).find(
                (n) => n.type === "Stmt.For",
            ) as Extract<IrNode, { type: "Stmt.For" }>;
            expect(forStmt).toBeDefined();
            expect(forStmt.item).toBe("item");
        });
    });
});

describe("Comments", () => {
    it("should parse comments", () => {
        const source = `Hello <# This is a comment #> World`;
        const doc = parse(source);
        expect(doc.body.type).toBe("Template");
        expect(children(doc).some((n) => n.type === "Comment")).toBe(true);
    });
});

describe("TemplateLanguage Configuration", () => {
    it("should create doki language with correct delimiters", () => {
        expect(DOKI_LANGUAGE.template.codeStart).toBe("{%");
        expect(DOKI_LANGUAGE.template.codeEnd).toBe("%}");
    });

    it("should create dejavu language with correct delimiters", () => {
        expect(DEFAULT_LANGUAGE.template.codeStart).toBe("<%");
        expect(DEFAULT_LANGUAGE.template.codeEnd).toBe("%>");
    });
});

describe("Parser Direct Usage", () => {
    it("should parse with custom language config", () => {
        const source = "{% name %}";
        const doc = parse(source, DOKI_LANGUAGE);
        expect(doc.body.type).toBe("Template");
        expect(
            children(doc).some((n) => n.type === "Interpolation"),
        ).toBe(true);
    });

    it("should reject single-pipe filter syntax", () => {
        expect(() => parse("<% name | upper %>")).toThrow();
    });
});
