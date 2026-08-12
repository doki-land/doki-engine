import { describe, it, expect } from "vitest";
import { DejavuLanguage, Parser } from "@doki-land/dejavu-engine";
import { TextDocument } from "vscode-languageserver-textdocument";

describe("Edge Cases Tests", () => {
  const dokiLanguage = new DejavuLanguage().withTemplate({
    codeStart: "{%",
    codeEnd: "%}",
    commentStart: "{#",
    commentEnd: "#}",
  });

  function createDocument(content: string, uri = "test://test.doki"): TextDocument {
    return TextDocument.create(uri, "doki", 0, content);
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

      const parser = new Parser(largeContent, dokiLanguage);
      const ast = parser.parse();
      expect(ast).toBeDefined();
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

      const parser = new Parser(nestedContent, dokiLanguage);
      const ast = parser.parse();
      expect(ast).toBeDefined();
    });

    it("should handle complex expressions", () => {
      const complexExpressions = `
{% (a + b) * c / 2 %}
{% a > b %}
{% name |> upper %}
{% items |> join %}
`;

      const parser = new Parser(complexExpressions, dokiLanguage);
      const ast = parser.parse();
      expect(ast).toBeDefined();
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

      const parser = new Parser(brokenContent, dokiLanguage);
      expect(() => parser.parse()).toThrow();
    });

    it("should throw on syntax errors", () => {
      const syntaxErrorContent = `
{% if a > 10
  yes
{% end if %}
`;

      const parser = new Parser(syntaxErrorContent, dokiLanguage);
      expect(() => parser.parse()).toThrow();
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

      const parser = new Parser(circularContent, dokiLanguage);
      const ast = parser.parse();
      expect(ast).toBeDefined();
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

      const parser = new Parser(multipleBlocks, dokiLanguage);
      const ast = parser.parse();
      expect(ast).toBeDefined();
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
      const parser = new Parser(variablesContent, dokiLanguage);
      const ast = parser.parse();
      const endTime = Date.now();

      expect(ast).toBeDefined();
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it("should handle many function calls", () => {
      let functionsContent = "";
      for (let i = 0; i < 200; i++) {
        functionsContent += `{% len("test") + ${i} %} `;
      }

      const startTime = Date.now();
      const parser = new Parser(functionsContent, dokiLanguage);
      const ast = parser.parse();
      const endTime = Date.now();

      expect(ast).toBeDefined();
      expect(endTime - startTime).toBeLessThan(3000);
    });
  });
});
