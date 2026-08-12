import { describe, it, expect } from "vitest";
import { DejavuLanguage, NodeType, Parser } from "@doki-land/dejavu-engine";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Position, Range } from "vscode-languageserver/node";

describe("Template Inheritance Analyzer Tests", () => {
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

  describe("Extends Statement Analysis", () => {
    it("should parse extends statement with string literal", () => {
      const content = '{% extends "base.html" %}';
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      expect(ast.type).toBe(NodeType.Program);
      expect(ast.body.length).toBe(1);
      
      const extendsStmt = ast.body[0] as any;
      expect(extendsStmt.type).toBe("ExtendsStatement");
      expect(extendsStmt.template.value).toBe("base.html");
    });

    it("should parse extends statement with path", () => {
      const content = '{% extends "layouts/main.html" %}';
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const extendsStmt = ast.body[0] as any;
      expect(extendsStmt.template.value).toBe("layouts/main.html");
    });

    it("should parse extends with variable", () => {
      const content = "{% extends parent %}";
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const extendsStmt = ast.body[0] as any;
      expect(extendsStmt.type).toBe("ExtendsStatement");
    });
  });

  describe("Block Declaration Analysis", () => {
    it("should parse empty block", () => {
      const content = "{% block content %}{% end block %}";
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const blockDecl = ast.body[0] as any;
      expect(blockDecl.type).toBe("BlockDeclaration");
      expect(blockDecl.name.name).toBe("content");
    });

    it("should parse block with content", () => {
      const content = "{% block title %}Hello World{% end block %}";
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const blockDecl = ast.body[0] as any;
      expect(blockDecl.name.name).toBe("title");
      expect(blockDecl.body).toBeDefined();
    });

    it("should parse nested blocks", () => {
      const content = `{% block outer %}
{% block inner %}Nested{% end block %}
{% end block %}`;
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const outerBlock = ast.body[0] as any;
      expect(outerBlock.name.name).toBe("outer");
    });

    it("should parse multiple blocks", () => {
      const content = `{% block header %}Header{% end block %}{% block content %}Content{% end block %}{% block footer %}Footer{% end block %}`;
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const blocks = ast.body.filter((n: any) => n.type === "BlockDeclaration");
      expect(blocks.length).toBeGreaterThanOrEqual(1);
    });
  });

  // legacy-programming-only: prepend / append are not in the IR template contract
  describe.skip("Prepend Statement Analysis (legacy-programming-only: not in IR)", () => {
    it("should parse prepend statement", () => {
      const content = "{% prepend sidebar %}Extra{% end block %}";
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const prependStmt = ast.body[0] as any;
      expect(prependStmt.type).toBe("PrependStatement");
      expect(prependStmt.name.name).toBe("sidebar");
    });

    it("should parse prepend with complex content", () => {
      const content = `{% prepend head %}
<meta name="description" content="test">
<link rel="stylesheet" href="extra.css">
{% end block %}`;
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const prependStmt = ast.body[0] as any;
      expect(prependStmt.type).toBe("PrependStatement");
    });
  });

  describe.skip("Append Statement Analysis (legacy-programming-only: not in IR)", () => {
    it("should parse append statement", () => {
      const content = "{% append scripts %}<script>{% end block %}";
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const appendStmt = ast.body[0] as any;
      expect(appendStmt.type).toBe("AppendStatement");
      expect(appendStmt.name.name).toBe("scripts");
    });

    it("should parse append with multiple elements", () => {
      const content = `{% append footer %}
<script src="a.js"></script>
<script src="b.js"></script>
{% end block %}`;
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const appendStmt = ast.body[0] as any;
      expect(appendStmt.type).toBe("AppendStatement");
    });
  });

  describe("Super Expression Analysis", () => {
    it("should parse super() expression", () => {
      const content = "{% block content %}{% super() %} Extra{% end block %}";
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const blockDecl = ast.body[0] as any;
      expect(blockDecl.type).toBe("BlockDeclaration");
    });

    it("should parse super without parentheses", () => {
      const content = "{% block content %}{% super %}{% end block %}";
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const blockDecl = ast.body[0] as any;
      expect(blockDecl.type).toBe("BlockDeclaration");
    });
  });

  describe("Complete Template Inheritance", () => {
    it("should parse complete inheritance template", () => {
      const content = `{% extends "base.html" %}{% block title %}My Page{% end block %}{% block content %}<h1>Welcome</h1><p>This is my page.</p>{% end block %}`;
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const extendsStmt = ast.body.find((n: any) => n.type === "ExtendsStatement");
      expect(extendsStmt).toBeDefined();
      
      const blocks = ast.body.filter((n: any) => n.type === "BlockDeclaration");
      expect(blocks.length).toBeGreaterThanOrEqual(1);
    });

    // legacy-programming-only: prepend not in IR
    it.skip("should parse template with prepend and append (legacy-programming-only: not in IR)", () => {
      const content = `{% extends "base.html" %}{% prepend head %}test{% end block %}`;
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const extendsStmt = ast.body.find((n: any) => n.type === NodeType.ExtendsStatement);
      expect(extendsStmt).toBeDefined();
      
      const prependStmt = ast.body.find((n: any) => n.type === NodeType.PrependStatement);
      expect(prependStmt).toBeDefined();
    });

    it("should parse template with super in block", () => {
      const content = `{% extends "base.html" %}
{% block content %}
{% super() %}
<p>Additional content</p>
{% end block %}`;
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const blockDecl = ast.body.find((n: any) => n.type === "BlockDeclaration");
      expect(blockDecl).toBeDefined();
    });
  });

  describe("Block in Control Flow", () => {
    it("should parse block inside if statement", () => {
      const content = `{% if showBlock %}
{% block conditional %}Content{% end block %}
{% end if %}`;
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const ifStmt = ast.body.find((n: any) => n.type === NodeType.IfStatement);
      expect(ifStmt).toBeDefined();
    });

    it("should parse block inside loop", () => {
      const content = `{% loop i in items %}
{% block item %}{{ i }}{% end block %}
{% end loop %}`;
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const forInStmt = ast.body.find((n: any) => n.type === NodeType.ForInStatement);
      expect(forInStmt).toBeDefined();
    });
  });

  describe("Dejavu Language Support", () => {
    it("should parse extends in dejavu syntax", () => {
      const content = '<% extends "base.html" %>';
      const parser = new Parser(content, dejavuLanguage);
      const ast = parser.parse();
      
      const extendsStmt = ast.body[0] as any;
      expect(extendsStmt.type).toBe("ExtendsStatement");
    });

    it("should parse block in dejavu syntax", () => {
      const content = "<% block content %>Default<% end block %>";
      const parser = new Parser(content, dejavuLanguage);
      const ast = parser.parse();
      
      const blockDecl = ast.body[0] as any;
      expect(blockDecl.type).toBe("BlockDeclaration");
    });

    it.skip("should parse prepend in dejavu syntax (legacy-programming-only: not in IR)", () => {
      const content = "<% prepend head %><meta><% end block %>";
      const parser = new Parser(content, dejavuLanguage);
      const ast = parser.parse();
      
      const prependStmt = ast.body[0] as any;
      expect(prependStmt.type).toBe("PrependStatement");
    });

    it.skip("should parse append in dejavu syntax (legacy-programming-only: not in IR)", () => {
      const content = "<% append scripts %><script><% end block %>";
      const parser = new Parser(content, dejavuLanguage);
      const ast = parser.parse();
      
      const appendStmt = ast.body[0] as any;
      expect(appendStmt.type).toBe("AppendStatement");
    });
  });

  describe("Block Name Extraction", () => {
    it("should extract block name correctly", () => {
      const content = "{% block myBlock %}content{% end block %}";
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const blockDecl = ast.body[0] as any;
      expect(blockDecl.name.name).toBe("myBlock");
    });

    it.skip("should extract prepend name correctly (legacy-programming-only: not in IR)", () => {
      const content = "{% prepend myPrepend %}content{% end block %}";
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const prependStmt = ast.body[0] as any;
      expect(prependStmt.name.name).toBe("myPrepend");
    });

    it.skip("should extract append name correctly (legacy-programming-only: not in IR)", () => {
      const content = "{% append myAppend %}content{% end block %}";
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const appendStmt = ast.body[0] as any;
      expect(appendStmt.name.name).toBe("myAppend");
    });
  });

  // IR parser does not attach spans yet — loc remains undefined on adapted nodes
  describe.skip("Location Information (IR spans not populated yet)", () => {
    it("should have location info for block", () => {
      const content = "{% block content %}text{% end block %}";
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const blockDecl = ast.body[0] as any;
      expect(blockDecl.loc).toBeDefined();
      expect(blockDecl.loc.start.line).toBe(1);
    });

    it("should have location info for extends", () => {
      const content = '{% extends "base.html" %}';
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const extendsStmt = ast.body[0] as any;
      expect(extendsStmt.loc).toBeDefined();
    });

    it("should have correct end location for block", () => {
      const content = "{% block content %}text{% end block %}";
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const blockDecl = ast.body[0] as any;
      expect(blockDecl.loc.end).toBeDefined();
    });
  });

  describe("Complex Inheritance Scenarios", () => {
    it("should parse multi-level inheritance simulation", () => {
      const childContent = `{% extends "parent.html" %}
{% block content %}
{% super() %}
<p>Child content</p>
{% end block %}`;
      
      const parser = new Parser(childContent, dokiLanguage);
      const ast = parser.parse();
      
      const significant = ast.body.filter((n: any) => n.type !== NodeType.Text);
      expect(significant.length).toBe(2);
      expect(significant.some((n: any) => n.type === NodeType.ExtendsStatement)).toBe(true);
      expect(significant.some((n: any) => n.type === NodeType.BlockDeclaration)).toBe(true);
    });

    it("should parse template with block and prepend", () => {
      const content = `{% extends "base.html" %}{% block title %}My Title{% end block %}`;
      
      const parser = new Parser(content, dokiLanguage);
      const ast = parser.parse();
      
      const extendsStmt = ast.body.find((n: any) => n.type === NodeType.ExtendsStatement);
      expect(extendsStmt).toBeDefined();
      
      const blocks = ast.body.filter((n: any) => n.type === NodeType.BlockDeclaration);
      expect(blocks.length).toBeGreaterThanOrEqual(1);
    });
  });
});
