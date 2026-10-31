import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DOKI_LANGUAGE, parseTemplate } from "../src/template/index";

describe("Edge Cases Tests", () => {
    function _createDocument(
        content: string,
        uri = "test://test.doki",
    ): TextDocument {
        return TextDocument.create(uri, "doki", 0, content);
    }

    function parse(source: string) {
        return parseTemplate(source, DOKI_LANGUAGE);
    }

    describe("Large Document Handling", () => {
        it("should handle very large documents", () => {
            let largeContent = '{% extends "base.html" %}\n';

            for (let i = 0; i < 1000; i++) {
                largeContent += `{% block b${i} %}value${i}{% end block %}\n`;
            }

            for (let i = 0; i < 100; i++) {
                largeContent += `{% loop item in items %}\n`;
                largeContent += `  {% item %}\n`;
                largeContent += `{% end loop %}\n`;
            }

            for (let i = 0; i < 100; i++) {
                largeContent += `{% if flag${i} %}\n`;
                largeContent += `  yes\n`;
                largeContent += `{% else %}\n`;
                largeContent += `  No value\n`;
                largeContent += `{% end if %}\n`;
            }

            const doc = parse(largeContent);
            expect(doc).toBeDefined();
        });
    });

    describe("Complex Syntax", () => {
        it("should handle deeply nested structures", () => {
            const nestedContent = `
{% extends "base.html" %}

{% block content %}
  {% if user %}
    {% if user.is_admin %}
      {% loop item in items %}
        {% if item.active %}
          {% loop subitem in item.subitems %}
            {% subitem.name %}
          {% end loop %}
        {% end if %}
      {% end loop %}
    {% else %}
      <p>Not admin</p>
    {% end if %}
  {% else %}
    <p>Not logged in</p>
  {% end if %}
{% end block %}
`;

            const doc = parse(nestedContent);
            expect(doc).toBeDefined();
        });

        it("should handle complex expressions", () => {
            const complexExpressions = `
{% (a + b) * c / 2 %}
{% a > b %}
{% name |> upper %}
{% items |> join %}
`;

            const doc = parse(complexExpressions);
            expect(doc).toBeDefined();
        });
    });

    describe("Error Recovery", () => {
        // IR parser is strict — broken templates throw
        it("should throw on missing closing delimiters", () => {
            const brokenContent = `
{% extends "base.html"
{% block content %}
  <h1>Hello
{% end block %}
`;

            expect(() => parse(brokenContent)).toThrow();
        });

        it("should throw on syntax errors", () => {
            const syntaxErrorContent = `
{% if a > 10
  yes
{% end if %}
`;

            expect(() => parse(syntaxErrorContent)).toThrow();
        });
    });

    describe("Template Inheritance Edge Cases", () => {
        it("should handle circular inheritance references", () => {
            const circularContent = `
{% extends "self.html" %}

{% block content %}
  <h1>Circular</h1>
{% end block %}
`;

            const doc = parse(circularContent);
            expect(doc).toBeDefined();
        });

        it("should handle multiple block overrides", () => {
            const multipleBlocks = `
{% extends "base.html" %}

{% block header %}
  <h1>Custom Header</h1>
{% end block %}

{% block content %}
  <p>Custom Content</p>
{% end block %}

{% block footer %}
  <p>Custom Footer</p>
{% end block %}
`;

            const doc = parse(multipleBlocks);
            expect(doc).toBeDefined();
        });
    });

    describe("Performance Edge Cases", () => {
        it("should handle many blocks", () => {
            let variablesContent = "";
            for (let i = 0; i < 500; i++) {
                variablesContent += `{% block var${i} %}${i}{% end block %}\n`;
            }

            variablesContent += "<div>";
            for (let i = 0; i < 500; i++) {
                variablesContent += `{% var${i} %} `;
            }
            variablesContent += "</div>";

            const startTime = Date.now();
            const doc = parse(variablesContent);
            const endTime = Date.now();

            expect(doc).toBeDefined();
            expect(endTime - startTime).toBeLessThan(5000);
        });

        it("should handle many function calls", () => {
            let functionsContent = "";
            for (let i = 0; i < 200; i++) {
                functionsContent += `{% len("test") + ${i} %} `;
            }

            const startTime = Date.now();
            const doc = parse(functionsContent);
            const endTime = Date.now();

            expect(doc).toBeDefined();
            expect(endTime - startTime).toBeLessThan(3000);
        });
    });
});
