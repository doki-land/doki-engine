import { DejavuLanguage, NodeType, Parser } from "@doki-land/dejavu-engine";
import { describe, expect, it } from "vitest";
import { Position, Range } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

describe("Diagnostics Tests", () => {
    const dokiLanguage = new DejavuLanguage().withTemplate({
        codeStart: "{%",
        codeEnd: "%}",
        commentStart: "{#",
        commentEnd: "#}",
    });

    const _dejavuLanguage = new DejavuLanguage().withTemplate({
        codeStart: "<%",
        codeEnd: "%>",
        commentStart: "<#",
        commentEnd: "#>",
    });

    function _createDocument(
        content: string,
        uri = "test://test.doki",
    ): TextDocument {
        return TextDocument.create(uri, "doki", 0, content);
    }

    describe("Delimiter Diagnostics", () => {
        it("should detect unclosed code delimiter", () => {
            const content = "{% let x = 1";
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
            const content = "{% let x = 1 %} %}";
            const openCode = (content.match(/{%/g) || []).length;
            const closeCode = (content.match(/%}/g) || []).length;

            expect(closeCode).toBeGreaterThan(openCode);
        });

        it("should accept balanced delimiters", () => {
            const content = "{% let x = 1 %}{% let y = 2 %}";
            const openCode = (content.match(/{%/g) || []).length;
            const closeCode = (content.match(/%}/g) || []).length;

            expect(openCode).toBe(closeCode);
        });
    });

    describe("Syntax Error Detection", () => {
        // legacy-programming-only: `let` / VariableDeclaration not in IR
        it.skip("should parse valid variable declaration (legacy-programming-only: not in IR)", () => {
            const content = "{% let x = 42 %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
            const varDecl = ast.body.find(
                (n: any) => n.type === NodeType.VariableDeclaration,
            );
            expect(varDecl).toBeDefined();
        });

        it("should parse valid if statement", () => {
            const content = "{% if true %}yes{% end if %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
            const ifStmt = ast.body.find(
                (n: any) => n.type === NodeType.IfStatement,
            );
            expect(ifStmt).toBeDefined();
        });

        it("should parse valid loop statement", () => {
            const content = "{% loop i in items %}{% i %}{% end loop %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
            const forInStmt = ast.body.find(
                (n: any) => n.type === NodeType.ForInStatement,
            );
            expect(forInStmt).toBeDefined();
        });

        // legacy-programming-only: match not in IR
        it.skip("should parse valid match statement (legacy-programming-only: not in IR)", () => {
            const content = `{% match x %}
{% case 1 %}One
{% case _ %}Other
{% end match %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
            const matchStmt = ast.body.find(
                (n: any) => n.type === NodeType.MatchStatement,
            );
            expect(matchStmt).toBeDefined();
        });
    });

    describe("Error Recovery", () => {
        it("should handle partial input gracefully", () => {
            const content = "{% if ";
            const parser = new Parser(content, dokiLanguage);

            expect(() => parser.parse()).toThrow();
        });

        it("should continue parsing after valid statements in block", () => {
            const content = `{% if true %}
valid content
{% end if %}
{% loop i in items %}{% i %}{% end loop %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
            expect(ast.body.length).toBeGreaterThan(0);
        });
    });
});

describe("Completion Context Detection", () => {
    const _dokiLanguage = new DejavuLanguage().withTemplate({
        codeStart: "{%",
        codeEnd: "%}",
        commentStart: "{#",
        commentEnd: "#}",
    });

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
            const line = "{% le";
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
            const line = "{% let x = 1 %} text";
            const context = detectContext(line, line.length);
            expect(context).toBe("text");
        });
    });
});

describe("Symbol Table Tests", () => {
    const dokiLanguage = new DejavuLanguage().withTemplate({
        codeStart: "{%",
        codeEnd: "%}",
        commentStart: "{#",
        commentEnd: "#}",
    });

    describe("Variable Symbols", () => {
        // legacy-programming-only: VariableDeclaration / let not in IR
        it.skip("should extract variable declaration (legacy-programming-only: not in IR)", () => {
            const content = "{% let x = 42 %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            const varDecl = ast.body.find(
                (n: any) => n.type === NodeType.VariableDeclaration,
            );
            expect(varDecl).toBeDefined();
            expect((varDecl as any).name.name).toBe("x");
        });

        it.skip("should extract multiple variable declarations (legacy-programming-only: not in IR)", () => {
            const content = "{% let x = 1 %}{% let y = 2 %}{% let z = 3 %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            const varDecls = ast.body.filter(
                (n: any) => n.type === NodeType.VariableDeclaration,
            );
            expect(varDecls).toHaveLength(3);
        });
    });

    describe("Function Symbols", () => {
        // legacy-programming-only: micro / FunctionDeclaration not in IR
        it.skip("should extract function declaration (legacy-programming-only: not in IR)", () => {
            const content = `{% micro greet(name) %}
Hello, {{ name }}!
{% end micro %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            const funcDecl = ast.body.find(
                (n: any) => n.type === NodeType.FunctionDeclaration,
            );
            expect(funcDecl).toBeDefined();
            expect((funcDecl as any).name.name).toBe("greet");
            expect((funcDecl as any).params).toHaveLength(1);
        });

        it.skip("should extract function with multiple parameters (legacy-programming-only: not in IR)", () => {
            const content = `{% micro add(a, b, c) %}
{{ a + b + c }}
{% end micro %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            const funcDecl = ast.body.find(
                (n: any) => n.type === NodeType.FunctionDeclaration,
            );
            expect(funcDecl).toBeDefined();
            expect((funcDecl as any).params).toHaveLength(3);
        });
    });

    describe("Loop Variable Symbols", () => {
        it("should extract loop variable", () => {
            const content = "{% loop i in items %}{% i %}{% end loop %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            const forInStmt = ast.body.find(
                (n: any) => n.type === NodeType.ForInStatement,
            );
            expect(forInStmt).toBeDefined();
            expect((forInStmt as any).left.name).toBe("i");
        });

        // IR loop form is `loop item in iterable` only (no index tuple)
        it.skip("should extract indexed loop variables (legacy-programming-only: indexed loop not in IR)", () => {
            const content =
                "{% loop (index, item) in items %}{{ index }}: {{ item }}{% end loop %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            const forInStmt = ast.body.find(
                (n: any) => n.type === NodeType.ForInStatement,
            );
            expect(forInStmt).toBeDefined();
            expect(Array.isArray((forInStmt as any).left)).toBe(true);
            expect((forInStmt as any).left).toHaveLength(2);
        });
    });

    describe("Block Symbols", () => {
        it("should extract block declaration", () => {
            const content = "{% block content %}Default{% end block %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            const blockDecl = ast.body.find(
                (n: any) => n.type === "BlockDeclaration",
            );
            expect(blockDecl).toBeDefined();
            expect((blockDecl as any).name.name).toBe("content");
        });

        it.skip("should extract prepend statement (legacy-programming-only: not in IR)", () => {
            const content = "{% prepend head %}<meta>{% end block %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            const prependStmt = ast.body.find(
                (n: any) => n.type === "PrependStatement",
            );
            expect(prependStmt).toBeDefined();
            expect((prependStmt as any).name.name).toBe("head");
        });

        it.skip("should extract append statement (legacy-programming-only: not in IR)", () => {
            const content = "{% append scripts %}<script>{% end block %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            const appendStmt = ast.body.find(
                (n: any) => n.type === "AppendStatement",
            );
            expect(appendStmt).toBeDefined();
            expect((appendStmt as any).name.name).toBe("scripts");
        });
    });
});

describe("Scope Analysis Tests", () => {
    const dokiLanguage = new DejavuLanguage().withTemplate({
        codeStart: "{%",
        codeEnd: "%}",
        commentStart: "{#",
        commentEnd: "#}",
    });

    describe("Function Scope", () => {
        // legacy-programming-only: micro / FunctionDeclaration not in IR
        it.skip("should create scope for function parameters (legacy-programming-only: not in IR)", () => {
            const content = `{% micro test(a, b) %}
{{ a }} - {{ b }}
{% end micro %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            const funcDecl = ast.body.find(
                (n: any) => n.type === NodeType.FunctionDeclaration,
            );
            expect(funcDecl).toBeDefined();
            expect((funcDecl as any).params).toHaveLength(2);
        });

        it.skip("should handle nested function declarations (legacy-programming-only: not in IR)", () => {
            const content = `{% micro outer() %}
{% micro inner() %}
nested
{% end micro %}
{% end micro %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
        });
    });

    describe("Loop Scope", () => {
        it("should create scope for loop variables", () => {
            const content = "{% loop i in items %}{% i %}{% end loop %}";
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            const forInStmt = ast.body.find(
                (n: any) => n.type === NodeType.ForInStatement,
            );
            expect(forInStmt).toBeDefined();
        });

        it("should handle nested loops", () => {
            const content = `{% loop i in rows %}
{% loop j in cols %}
{% i %},{% j %}
{% end loop %}
{% end loop %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            expect(ast.type).toBe(NodeType.Program);
        });
    });

    describe("If Statement Scope", () => {
        it("should handle if-else scope", () => {
            const content = `{% if x > 0 %}
positive
{% else %}
non-positive
{% end if %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            const ifStmt = ast.body.find(
                (n: any) => n.type === NodeType.IfStatement,
            );
            expect(ifStmt).toBeDefined();
            expect((ifStmt as any).alternate).toBeDefined();
        });

        it("should handle if-elseif-else scope", () => {
            const content = `{% if x > 0 %}
positive
{% else if x < 0 %}
negative
{% else %}
zero
{% end if %}`;
            const parser = new Parser(content, dokiLanguage);
            const ast = parser.parse();

            const ifStmt = ast.body.find(
                (n: any) => n.type === NodeType.IfStatement,
            );
            expect(ifStmt).toBeDefined();
            expect((ifStmt as any).elseIfs).toBeDefined();
            expect((ifStmt as any).elseIfs.length).toBeGreaterThan(0);
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
