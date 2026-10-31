import { describe, expect, it } from "vitest";
import { DOKI_LANGUAGE, parseTemplate } from "../src/template/index";

function parseExpr(source: string) {
    const doc = parseTemplate(source, DOKI_LANGUAGE);
    if (doc.body.type !== "Template") {
        throw new Error("expected Template root");
    }
    const interp = doc.body.children.find(
        (n) => n.type === "Interpolation",
    ) as Extract<
        (typeof doc.body.children)[number],
        { type: "Interpolation" }
    >;
    return interp.expression;
}

describe("Type Inference Tests", () => {
    describe("Literal Type Inference", () => {
        it("should parse number literal", () => {
            expect(parseExpr("{% 42 %}").type).toBe("Expr.Literal");
        });

        it("should parse string literal", () => {
            expect(parseExpr('{% "hello" %}').type).toBe("Expr.Literal");
        });

        it("should parse boolean literal", () => {
            expect(parseExpr("{% true %}").type).toBe("Expr.Literal");
        });

        it("should parse null literal", () => {
            expect(parseExpr("{% null %}").type).toBe("Expr.Literal");
        });
    });

    // engine template IR has no array literal syntax
    describe("Array Literals (not in engine contract)", () => {
        it("should reject array literal", () => {
            expect(() => parseTemplate("{% [1, 2, 3] %}", DOKI_LANGUAGE)).toThrow();
        });

        it("should reject empty array literal", () => {
            expect(() => parseTemplate("{% [] %}", DOKI_LANGUAGE)).toThrow();
        });
    });

    describe("Object Type Inference", () => {
        it("should parse object literal", () => {
            expect(
                parseExpr('{% { name: "test", value: 42 } %}').type,
            ).toBeDefined();
        });

        it("should parse empty object", () => {
            expect(parseExpr("{% {} %}").type).toBeDefined();
        });
    });

    describe("Binary Expression Type Inference", () => {
        it("should parse arithmetic operations", () => {
            expect(parseExpr("{% 1 + 2 %}").type).toBe("Expr.Binary");
        });

        it("should parse string concatenation", () => {
            expect(parseExpr('{% "hello" + " world" %}').type).toBe(
                "Expr.Binary",
            );
        });

        it("should parse comparison operations", () => {
            expect(parseExpr("{% 1 < 2 %}").type).toBe("Expr.Binary");
        });

        it("should parse equality operations", () => {
            expect(parseExpr("{% a == b %}").type).toBe("Expr.Binary");
        });

        it("should reject range expression (not in engine contract)", () => {
            expect(() => parseTemplate("{% 1..10 %}", DOKI_LANGUAGE)).toThrow();
        });
    });

    describe("Unary Expression Type Inference", () => {
        it("should parse bang operator", () => {
            expect(parseExpr("{% !true %}").type).toBe("Expr.Unary");
        });

        it("should parse negation", () => {
            expect(parseExpr("{% -5 %}").type).toBeDefined();
        });

        it("should reject `not` keyword (not in engine contract)", () => {
            expect(() =>
                parseTemplate("{% not true %}", DOKI_LANGUAGE),
            ).toThrow();
        });
    });

    describe("Call Expression Type Inference", () => {
        it("should parse function call", () => {
            expect(parseExpr("{% len(items) %}").type).toBe("Expr.Call");
        });

        it("should parse string function call", () => {
            expect(parseExpr('{% upper("hello") %}').type).toBe("Expr.Call");
        });
    });

    describe("Member Expression Type Inference", () => {
        it("should parse property access", () => {
            expect(parseExpr("{% user.name %}").type).toBe("Expr.Member");
        });

        it("should parse nested property access", () => {
            expect(parseExpr("{% user.address.city %}").type).toBe(
                "Expr.Member",
            );
        });

        it("should parse array index access", () => {
            expect(parseExpr("{% items[0] %}").type).toBe("Expr.Index");
        });
    });

    describe("Filter Expression Type Inference", () => {
        it("should parse filter expression", () => {
            expect(parseExpr("{% name |> upper %}").type).toBe("Expr.Pipe");
        });

        it("should parse chained filter expressions", () => {
            expect(parseExpr("{% name |> trim |> upper %}").type).toBe(
                "Expr.Pipe",
            );
        });

        it("should parse filter with arguments", () => {
            expect(
                parseExpr('{% name |> replace("a", "b") %}').type,
            ).toBe("Expr.Pipe");
        });
    });
});
