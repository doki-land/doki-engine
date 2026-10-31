import { DejavuLanguage, NodeType, Parser } from "@doki-land/dejavu-engine";
import { describe, expect, it } from "vitest";

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

function parse(source: string, language = dejavuLanguage) {
    return new Parser(source, language).parse();
}

describe("Doki LSP Parser Integration", () => {
    describe("Expressions", () => {
        it("should parse binary expressions", () => {
            const ast = parse("Result: <% 1 + 2 %>");
            expect(ast.type).toBe(NodeType.Program);
            const expr = ast.body.find(
                (n: any) => n.type === NodeType.ExpressionStatement,
            );
            expect(expr).toBeDefined();
            expect((expr as any).expression.type).toBe(
                NodeType.BinaryExpression,
            );
        });

        it("should parse function calls", () => {
            const ast = parse("Result: <% foo(1, 2) %>");
            expect(ast.type).toBe(NodeType.Program);
            const expr = ast.body.find(
                (n: any) => n.type === NodeType.ExpressionStatement,
            );
            expect((expr as any).expression.type).toBe(NodeType.CallExpression);
        });

        it("should parse filter pipes", () => {
            const ast = parse("<% name |> upper %>");
            const expr = ast.body.find(
                (n: any) => n.type === NodeType.ExpressionStatement,
            ) as any;
            expect(expr.expression.type).toBe(NodeType.PipeExpression);
            expect(expr.expression.filter.name).toBe("upper");
        });
    });

    describe("Mixed Content", () => {
        it("should parse template with text and code", () => {
            const ast = parse("Hello <% name %>!");
            expect(ast.type).toBe(NodeType.Program);
            expect(ast.body.some((n: any) => n.type === NodeType.Text)).toBe(
                true,
            );
            expect(
                ast.body.some(
                    (n: any) => n.type === NodeType.ExpressionStatement,
                ),
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
            const ast = parse(source);
            expect(ast.type).toBe(NodeType.Program);
            expect(
                ast.body.some((n: any) => n.type === NodeType.IfStatement),
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
            const ast = parse(source);
            const ifStmt = ast.body.find(
                (n: any) => n.type === NodeType.IfStatement,
            ) as any;
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
            const ast = parse(source);
            const ifStmt = ast.body.find(
                (n: any) => n.type === NodeType.IfStatement,
            ) as any;
            expect(ifStmt.elseIfs?.length).toBeGreaterThanOrEqual(1);
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
            const ast = parse(source);
            const forIn = ast.body.find(
                (n: any) => n.type === NodeType.ForInStatement,
            ) as any;
            expect(forIn).toBeDefined();
            expect(forIn.item).toBe("item");
            expect(forIn.left.name).toBe("item");
        });
    });
});

describe("Comments", () => {
    it("should parse comments", () => {
        const source = `Hello <# This is a comment #> World`;
        const ast = parse(source);
        expect(ast.type).toBe(NodeType.Program);
        expect(ast.body.some((n: any) => n.type === NodeType.Comment)).toBe(
            true,
        );
    });
});

describe("DejavuLanguage Configuration", () => {
    it("should create doki language with correct delimiters", () => {
        expect(dokiLanguage.template.codeStart).toBe("{%");
        expect(dokiLanguage.template.codeEnd).toBe("%}");
    });

    it("should create dejavu language with correct delimiters", () => {
        expect(dejavuLanguage.template.codeStart).toBe("<%");
        expect(dejavuLanguage.template.codeEnd).toBe("%>");
    });
});

describe("Parser Direct Usage", () => {
    it("should parse with custom language config", () => {
        const source = "{% name %}";
        const ast = parse(source, dokiLanguage);
        expect(ast.type).toBe(NodeType.Program);
        expect(
            ast.body.some((n: any) => n.type === NodeType.ExpressionStatement),
        ).toBe(true);
    });

    it("should reject single-pipe filter syntax", () => {
        expect(() => parse("<% name | upper %>")).toThrow();
    });
});
