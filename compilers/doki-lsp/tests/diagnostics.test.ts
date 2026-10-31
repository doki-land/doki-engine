import { describe, expect, it } from "vitest";
import { Position, Range } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
    DOKI_LANGUAGE,
    parseTemplate,
    type IrNode,
} from "../src/template/index";

function children(doc: { body: IrNode }): IrNode[] {
    return doc.body.type === "Template" ? doc.body.children : [];
}

describe("Diagnostics Tests", () => {
    describe("Delimiter Diagnostics", () => {
        it("should detect unclosed code delimiter", () => {
            const content = "{% if x > 1";
            const openCode = (content.match(/{%/g) || []).length;
            const closeCode = (content.match(/%}/g) || []).length;

            expect(openCode).toBe(1);
            expect(closeCode).toBe(0);
            expect(openCode).toBeGreaterThan(closeCode);
        });

        it("should detect unclosed comment delimiter", () => {
            const content = "{# This is a comment";
            const openComment = (content.match(/{#/g) || []).length;
            const closeComment = (content.match(/#}/g) || []).length;

            expect(openComment).toBe(1);
            expect(closeComment).toBe(0);
            expect(openComment).toBeGreaterThan(closeComment);
        });

        it("should detect extra closing delimiter", () => {
            const content = "{% if x > 1 %} %}";
            const openCode = (content.match(/{%/g) || []).length;
            const closeCode = (content.match(/%}/g) || []).length;

            expect(closeCode).toBeGreaterThan(openCode);
        });

        it("should accept balanced delimiters", () => {
            const content = "{% if x > 1 %}{% end if %}";
            const openCode = (content.match(/{%/g) || []).length;
            const closeCode = (content.match(/%}/g) || []).length;

            expect(openCode).toBe(closeCode);
        });
    });

    describe("Syntax Error Detection", () => {
        it("should parse valid if statement", () => {
            const content = "{% if true %}yes{% end if %}";
            const doc = parseTemplate(content, DOKI_LANGUAGE);

            expect(doc.body.type).toBe("Template");
            const ifStmt = children(doc).find((n) => n.type === "Stmt.If");
            expect(ifStmt).toBeDefined();
        });

        it("should parse valid loop statement", () => {
            const content = "{% loop i in items %}{% i %}{% end loop %}";
            const doc = parseTemplate(content, DOKI_LANGUAGE);

            expect(doc.body.type).toBe("Template");
            const forStmt = children(doc).find((n) => n.type === "Stmt.For");
            expect(forStmt).toBeDefined();
        });
    });

    describe("Error Recovery", () => {
        it("should handle partial input gracefully", () => {
            const content = "{% if ";
            expect(() => parseTemplate(content, DOKI_LANGUAGE)).toThrow();
        });

        it("should continue parsing after valid statements in block", () => {
            const content = `{% if true %}
valid content
{% end if %}
{% loop i in items %}{% i %}{% end loop %}`;
            const doc = parseTemplate(content, DOKI_LANGUAGE);

            expect(doc.body.type).toBe("Template");
            expect(children(doc).length).toBeGreaterThan(0);
        });
    });
});

describe("Completion Context Detection", () => {
    function detectContext(
        lineContent: string,
        cursorPosition: number,
    ): string {
        const beforeCursor = lineContent.substring(0, cursorPosition);

        if (/\|\s*\w*$/.test(beforeCursor)) {
            return "filter";
        }

        if (/\.\w*$/.test(beforeCursor)) {
            return "property";
        }

        if (/\{%\s+\w+$/.test(beforeCursor)) {
            return "variable";
        }

        if (/\{%\s*$/.test(beforeCursor)) {
            return "keyword";
        }

        if (/\{\{\s+\w+$/.test(beforeCursor)) {
            return "variable";
        }

        if (/\{\{\s*$/.test(beforeCursor)) {
            return "expression";
        }

        return "text";
    }

    describe("Filter Context", () => {
        it("should detect filter context after pipe", () => {
            const line = "{{ name | ";
            const context = detectContext(line, line.length);
            expect(context).toBe("filter");
        });

        it("should detect filter context with partial filter name", () => {
            const line = "{{ name | up";
            const context = detectContext(line, line.length);
            expect(context).toBe("filter");
        });
    });

    describe("Property Access Context", () => {
        it("should detect property access after dot", () => {
            const line = "{{ user.";
            const context = detectContext(line, line.length);
            expect(context).toBe("property");
        });

        it("should detect property access with partial name", () => {
            const line = "{{ user.na";
            const context = detectContext(line, line.length);
            expect(context).toBe("property");
        });
    });

    describe("Keyword Context", () => {
        it("should detect keyword context at code block start", () => {
            const line = "{% ";
            const context = detectContext(line, line.length);
            expect(context).toBe("keyword");
        });

        it("should detect variable context with partial keyword", () => {
            const line = "{% lo";
            const context = detectContext(line, line.length);
            expect(context).toBe("variable");
        });
    });

    describe("Expression Context", () => {
        it("should detect expression context in output block", () => {
            const line = "{{ ";
            const context = detectContext(line, line.length);
            expect(context).toBe("expression");
        });

        it("should detect variable context at output start", () => {
            const line = "{{ us";
            const context = detectContext(line, line.length);
            expect(context).toBe("variable");
        });
    });

    describe("Text Context", () => {
        it("should detect text context outside blocks", () => {
            const line = "Hello World";
            const context = detectContext(line, line.length);
            expect(context).toBe("text");
        });

        it("should detect text context after closed block", () => {
            const line = "{% if true %} text";
            const context = detectContext(line, line.length);
            expect(context).toBe("text");
        });
    });
});

describe("Symbol Table Tests", () => {
    describe("Loop Variable Symbols", () => {
        it("should extract loop variable", () => {
            const content = "{% loop i in items %}{% i %}{% end loop %}";
            const doc = parseTemplate(content, DOKI_LANGUAGE);

            const forStmt = children(doc).find(
                (n) => n.type === "Stmt.For",
            ) as Extract<IrNode, { type: "Stmt.For" }>;
            expect(forStmt).toBeDefined();
            expect(forStmt.item).toBe("i");
        });
    });

    describe("Block Symbols", () => {
        it("should extract block declaration", () => {
            const content = "{% block content %}Default{% end block %}";
            const doc = parseTemplate(content, DOKI_LANGUAGE);

            const blockDecl = children(doc).find(
                (n) => n.type === "Stmt.Block",
            ) as Extract<IrNode, { type: "Stmt.Block" }>;
            expect(blockDecl).toBeDefined();
            expect(blockDecl.name).toBe("content");
        });
    });
});

describe("Scope Analysis Tests", () => {
    describe("Loop Scope", () => {
        it("should create scope for loop variables", () => {
            const content = "{% loop i in items %}{% i %}{% end loop %}";
            const doc = parseTemplate(content, DOKI_LANGUAGE);

            const forStmt = children(doc).find((n) => n.type === "Stmt.For");
            expect(forStmt).toBeDefined();
        });

        it("should handle nested loops", () => {
            const content = `{% loop i in rows %}
{% loop j in cols %}
{% i %},{% j %}
{% end loop %}
{% end loop %}`;
            const doc = parseTemplate(content, DOKI_LANGUAGE);

            expect(doc.body.type).toBe("Template");
        });
    });

    describe("If Statement Scope", () => {
        it("should handle if-else scope", () => {
            const content = `{% if x > 0 %}
positive
{% else %}
non-positive
{% end if %}`;
            const doc = parseTemplate(content, DOKI_LANGUAGE);

            const ifStmt = children(doc).find(
                (n) => n.type === "Stmt.If",
            ) as Extract<IrNode, { type: "Stmt.If" }>;
            expect(ifStmt).toBeDefined();
            expect(ifStmt.alternate).toBeDefined();
        });

        it("should handle if-elseif-else scope", () => {
            const content = `{% if x > 0 %}
positive
{% else if x < 0 %}
negative
{% else %}
zero
{% end if %}`;
            const doc = parseTemplate(content, DOKI_LANGUAGE);

            const ifStmt = children(doc).find(
                (n) => n.type === "Stmt.If",
            ) as Extract<IrNode, { type: "Stmt.If" }>;
            expect(ifStmt).toBeDefined();
            expect(ifStmt.elseIfs.length).toBeGreaterThan(0);
        });
    });
});

describe("Position and Range Tests", () => {
    function createDocument(content: string): TextDocument {
        return TextDocument.create("test://test.doki", "doki", 0, content);
    }

    describe("Position Conversion", () => {
        it("should convert position to offset correctly", () => {
            const content = "line1\nline2\nline3";
            const document = createDocument(content);

            const offset = document.offsetAt(Position.create(1, 2));
            expect(offset).toBe(8);
        });

        it("should convert offset to position correctly", () => {
            const content = "line1\nline2\nline3";
            const document = createDocument(content);

            const position = document.positionAt(8);
            expect(position.line).toBe(1);
            expect(position.character).toBe(2);
        });

        it("should handle end of document", () => {
            const content = "hello";
            const document = createDocument(content);

            const offset = document.offsetAt(Position.create(0, 5));
            expect(offset).toBe(5);
        });
    });

    describe("Range Operations", () => {
        it("should get text for range", () => {
            const content = "hello world";
            const document = createDocument(content);

            const text = document.getText(
                Range.create(Position.create(0, 0), Position.create(0, 5)),
            );
            expect(text).toBe("hello");
        });

        it("should handle multi-line range", () => {
            const content = "line1\nline2\nline3";
            const document = createDocument(content);

            const text = document.getText(
                Range.create(Position.create(0, 3), Position.create(1, 3)),
            );
            expect(text).toBe("e1\nlin");
        });
    });

    describe("Line Operations", () => {
        it("should count lines correctly", () => {
            const content = "line1\nline2\nline3";
            const document = createDocument(content);

            expect(document.lineCount).toBe(3);
        });

        it("should handle empty document", () => {
            const content = "";
            const document = createDocument(content);

            expect(document.lineCount).toBe(1);
        });

        it("should handle trailing newline", () => {
            const content = "line1\nline2\n";
            const document = createDocument(content);

            expect(document.lineCount).toBe(3);
        });
    });
});
