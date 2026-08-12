import { describe, it, expect } from "vitest";
import { DejavuLanguage, NodeType, Parser } from "@doki-land/dejavu-engine";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Position, Range } from "vscode-languageserver/node";

describe("Completion Provider Tests", () => {
  const dokiLanguage = new DejavuLanguage().withTemplate({
    codeStart: "{%",
    codeEnd: "%}",
    commentStart: "{#",
    commentEnd: "#}",
  });

  const dejavuLanguage = new DejavuLanguage().withTemplate({
    codeStart: "<%",
    codeEnd: "%>",
    commentStart: "<#",
    commentEnd: "#>",
  });

  function createDocument(content: string, uri = "test://test.doki"): TextDocument {
    return TextDocument.create(uri, "doki", 0, content);
  }

  describe("Context Detection", () => {
    function detectContext(line: string, cursorPos: number): string {
        const beforeCursor = line.substring(0, cursorPos);
        
        if (/\|\s*\w*$/.test(beforeCursor)) {
            return "filter";
        }
        
        if (/\.\w*$/.test(beforeCursor)) {
            return "property";
        }
        
        if (/\{\%\s+\w+$/.test(beforeCursor)) {
            return "variable";
        }
        
        if (/\{\%\s*$/.test(beforeCursor)) {
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

    it("should detect text context outside blocks", () => {
        const line = "Hello World";
        const context = detectContext(line, line.length);
        expect(context).toBe("text");
    });
  });

  describe("Keyword Completions", () => {
    const keywords = [
        "let", "if", "else", "loop", "break", "continue",
        "micro", "namespace", "using", "match", "case", "end",
        "extends", "block", "prepend", "append", "super",
        "true", "false", "null"
    ];

    it("should have all essential keywords", () => {
        expect(keywords).toContain("let");
        expect(keywords).toContain("if");
        expect(keywords).toContain("loop");
        expect(keywords).toContain("micro");
        expect(keywords).toContain("match");
    });

    it("should have template inheritance keywords", () => {
        expect(keywords).toContain("extends");
        expect(keywords).toContain("block");
        expect(keywords).toContain("prepend");
        expect(keywords).toContain("append");
        expect(keywords).toContain("super");
    });

    it("should have boolean literals", () => {
        expect(keywords).toContain("true");
        expect(keywords).toContain("false");
        expect(keywords).toContain("null");
    });
  });

  describe("Builtin Function Completions", () => {
    const builtinFunctions = [
        "len", "upper", "lower", "trim", "split", "join",
        "replace", "substr", "slice", "keys", "values", "items",
        "range", "int", "float", "str", "bool", "list", "dict",
        "min", "max", "sum", "abs", "round", "floor", "ceil",
        "sort", "reverse", "map", "filter", "reduce", "find",
        "any", "all", "enumerate", "zip"
    ];

    it("should have string functions", () => {
        expect(builtinFunctions).toContain("upper");
        expect(builtinFunctions).toContain("lower");
        expect(builtinFunctions).toContain("trim");
        expect(builtinFunctions).toContain("split");
        expect(builtinFunctions).toContain("join");
        expect(builtinFunctions).toContain("replace");
    });

    it("should have array functions", () => {
        expect(builtinFunctions).toContain("len");
        expect(builtinFunctions).toContain("sort");
        expect(builtinFunctions).toContain("reverse");
        expect(builtinFunctions).toContain("map");
        expect(builtinFunctions).toContain("filter");
        expect(builtinFunctions).toContain("reduce");
    });

    it("should have type conversion functions", () => {
        expect(builtinFunctions).toContain("int");
        expect(builtinFunctions).toContain("float");
        expect(builtinFunctions).toContain("str");
        expect(builtinFunctions).toContain("bool");
    });

    it("should have object functions", () => {
        expect(builtinFunctions).toContain("keys");
        expect(builtinFunctions).toContain("values");
        expect(builtinFunctions).toContain("items");
    });

    it("should have math functions", () => {
        expect(builtinFunctions).toContain("min");
        expect(builtinFunctions).toContain("max");
        expect(builtinFunctions).toContain("sum");
        expect(builtinFunctions).toContain("abs");
        expect(builtinFunctions).toContain("round");
    });
  });

  describe("Filter Completions", () => {
    const builtinFilters = [
        "upper", "lower", "capitalize", "trim", "strip",
        "length", "size", "default", "join", "split",
        "first", "last", "reverse", "sort", "sort_reverse",
        "slice", "keys", "values", "escape", "e", "safe", "raw",
        "int", "float", "string", "round", "abs", "date",
        "truncate", "wordwrap", "replace", "title", "strip_tags",
        "unique", "map", "reject", "select"
    ];

    it("should have string filters", () => {
        expect(builtinFilters).toContain("upper");
        expect(builtinFilters).toContain("lower");
        expect(builtinFilters).toContain("capitalize");
        expect(builtinFilters).toContain("trim");
        expect(builtinFilters).toContain("title");
    });

    it("should have array filters", () => {
        expect(builtinFilters).toContain("length");
        expect(builtinFilters).toContain("first");
        expect(builtinFilters).toContain("last");
        expect(builtinFilters).toContain("reverse");
        expect(builtinFilters).toContain("sort");
    });

    it("should have escape filters", () => {
        expect(builtinFilters).toContain("escape");
        expect(builtinFilters).toContain("e");
        expect(builtinFilters).toContain("safe");
        expect(builtinFilters).toContain("raw");
    });

    it("should have type conversion filters", () => {
        expect(builtinFilters).toContain("int");
        expect(builtinFilters).toContain("float");
        expect(builtinFilters).toContain("string");
    });
  });

  describe("Template Variable Completions", () => {
    const templateVariables = [
        "site", "page", "data", "config", "theme", "paginator", "now", "request"
    ];

    it("should have core template variables", () => {
        expect(templateVariables).toContain("site");
        expect(templateVariables).toContain("page");
        expect(templateVariables).toContain("data");
        expect(templateVariables).toContain("config");
    });

    it("should have helper variables", () => {
        expect(templateVariables).toContain("now");
        expect(templateVariables).toContain("request");
    });

    it("should have pagination variable", () => {
        expect(templateVariables).toContain("paginator");
    });
  });

  describe("Snippet Completions", () => {
    const snippets = [
        "extends", "block", "prepend", "append", "super",
        "if", "ifelse", "loop", "loopi", "match",
        "while", "let", "micro", "namespace", "using",
        "filter", "range"
    ];

    it("should have control flow snippets", () => {
        expect(snippets).toContain("if");
        expect(snippets).toContain("ifelse");
        expect(snippets).toContain("loop");
        expect(snippets).toContain("match");
        expect(snippets).toContain("while");
    });

    it("should have template inheritance snippets", () => {
        expect(snippets).toContain("extends");
        expect(snippets).toContain("block");
        expect(snippets).toContain("prepend");
        expect(snippets).toContain("append");
        expect(snippets).toContain("super");
    });

    it("should have declaration snippets", () => {
        expect(snippets).toContain("let");
        expect(snippets).toContain("micro");
        expect(snippets).toContain("namespace");
        expect(snippets).toContain("using");
    });
  });

  describe("Language Support", () => {
    it("should parse doki syntax", () => {
        const content = "{% if show %}yes{% end if %}";
        const parser = new Parser(content, dokiLanguage);
        const ast = parser.parse();
        expect(ast.type).toBe(NodeType.Program);
        expect(ast.body.some((n: any) => n.type === NodeType.IfStatement)).toBe(true);
    });

    it("should parse dejavu syntax", () => {
        const content = "<% if show %>yes<% end if %>";
        const parser = new Parser(content, dejavuLanguage);
        const ast = parser.parse();
        expect(ast.type).toBe(NodeType.Program);
        expect(ast.body.some((n: any) => n.type === NodeType.IfStatement)).toBe(true);
    });
  });
});
