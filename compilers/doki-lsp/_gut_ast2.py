from pathlib import Path
import re

p = Path(r"src/index.ts")
text = p.read_text(encoding="utf-8")


def replace_between(text, start_marker, end_marker, new_body, label):
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f"start not found: {label}")
    end = text.find(end_marker, start + len(start_marker))
    if end < 0:
        raise SystemExit(f"end not found: {label}")
    print(f"{label}: [{start}:{end}] -> {len(new_body)} chars")
    return text[:start] + new_body + text[end:]


# --- Hover: getBlockHover + findBlockAtPosition ---
old_block_hover_start = """  private getBlockHover(
    document: TextDocument,
    position: Position,
    cachedDoc: CachedDocument
  ): Hover | null {
    if (!this.inheritanceAnalyzer || !cachedDoc.parseResult.ast) {
      return null;
    }

    const blockInfo = this.findBlockAtPosition(cachedDoc.parseResult.ast, position, document);
"""
# Find from getBlockHover through end of findBlockAtPosition (before nodeToRange in HoverProvider)
start = text.find("  private getBlockHover(")
if start < 0:
    raise SystemExit("getBlockHover not found")
# The next method after findBlockAtPosition is nodeToRange with comment 将 AST 节点转换为 Range
end_marker = "  /**\n   * 将 AST 节点转换为 Range\n   */\n  private nodeToRange(node: Node, document: TextDocument): Range {"
# There may be multiple — find the one after getBlockHover
end = text.find(end_marker, start)
if end < 0:
    raise SystemExit("nodeToRange after getBlockHover not found")

new_hover = """  private getBlockHover(
    document: TextDocument,
    position: Position,
    cachedDoc: CachedDocument
  ): Hover | null {
    if (!this.inheritanceAnalyzer || !cachedDoc.parseResult.ir) {
      return null;
    }

    const blockInfo = this.findBlockAtPosition(cachedDoc, position, document);
    if (!blockInfo) {
      return null;
    }

    const chain = this.inheritanceAnalyzer.getBlockChain(
      blockInfo.name,
      document.uri,
      document,
      cachedDoc
    );

    if (chain.length === 0) {
      return null;
    }

    const markdown = this.inheritanceAnalyzer.formatBlockOverrideChain(blockInfo.name, chain);

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: markdown,
      },
    };
  }

  /**
   * Find block at position from IR facts (not Program AST walk).
   */
  private findBlockAtPosition(
    cachedDoc: CachedDocument,
    position: Position,
    document: TextDocument
  ): BlockInfo | null {
    const ir = cachedDoc.parseResult.ir;
    if (!ir) return null;
    const offset = document.offsetAt(position);
    const facts = extractTemplateFacts(ir);
    for (const b of facts.blocks) {
      if (offset >= b.start && offset <= b.end) {
        const start = document.positionAt(Math.max(0, Math.min(b.start, document.getText().length)));
        const endPos = document.positionAt(Math.max(0, Math.min(b.end, document.getText().length)));
        return {
          name: b.name,
          range: Range.create(start, endPos),
          type: BlockType.Block,
          templatePath: document.uri,
          line: start.line + 1,
        };
      }
    }
    return null;
  }

  /**
   * Offset/range helper retained for legacy Node.loc call sites.
   */
"""
text = text[:start] + new_hover + text[end:]
print("rewrote getBlockHover/findBlockAtPosition")

# --- Definition: getExtendsDefinition + findExtendsAtPosition ---
start = text.find("  private getExtendsDefinition(")
if start < 0:
    raise SystemExit("getExtendsDefinition not found")
end_marker2 = "  /**\n   * 解析模板 URI\n   */\n  private resolveTemplateUri("
end = text.find(end_marker2, start)
if end < 0:
    raise SystemExit("resolveTemplateUri not found")

new_extends = """  private getExtendsDefinition(
    document: TextDocument,
    position: Position,
    cachedDoc: CachedDocument
  ): Definition | null {
    if (!cachedDoc.parseResult.ir) {
      return null;
    }

    const extendsInfo = this.findExtendsAtPosition(cachedDoc, position, document);
    if (!extendsInfo) {
      return null;
    }

    const parentTemplatePath = extendsInfo.templatePath;
    if (!parentTemplatePath) {
      return null;
    }

    const resolvedUri = this.resolveTemplateUri(document.uri, parentTemplatePath);
    if (!resolvedUri) {
      return null;
    }

    return {
      uri: resolvedUri,
      range: Range.create(Position.create(0, 0), Position.create(0, 0)),
    };
  }

  /**
   * Extends path from IR Stmt.Extends — not Program AST walk.
   */
  private findExtendsAtPosition(
    cachedDoc: CachedDocument,
    position: Position,
    document: TextDocument
  ): { templatePath: string; range: Range } | null {
    const ir = cachedDoc.parseResult.ir;
    if (!ir) return null;
    const facts = extractTemplateFacts(ir);
    if (!facts.extendsPath) return null;

    // Entire document may contain extends; accept when cursor is in any Stmt.Extends span.
    const offset = document.offsetAt(position);
    let hit = false;
    let spanStart = 0;
    let spanEnd = 0;
    walkIr(ir.body, (n) => {
      if (n.type !== "Stmt.Extends") return;
      const span = n.span;
      if (!span) return;
      if (offset >= span.start && offset <= span.end) {
        hit = true;
        spanStart = span.start;
        spanEnd = span.end;
      }
    });
    if (!hit) return null;
    const startPos = document.positionAt(Math.max(0, Math.min(spanStart, document.getText().length)));
    const endPos = document.positionAt(Math.max(0, Math.min(spanEnd, document.getText().length)));
    return {
      templatePath: facts.extendsPath,
      range: Range.create(startPos, endPos),
    };
  }

"""
text = text[:start] + new_extends + text[end:]
print("rewrote getExtendsDefinition/findExtendsAtPosition")

# --- Semantic tokens: replace getSemanticTokens + collectTokens + handleDefaultNode ---
start = text.find("  public getSemanticTokens(")
if start < 0:
    raise SystemExit("getSemanticTokens not found")
# Find pushToken method which should remain
end = text.find("  private pushToken(", start)
if end < 0:
    raise SystemExit("pushToken not found")

new_sem = """  public getSemanticTokens(
    document: TextDocument,
    cachedDoc: CachedDocument | undefined
  ): number[] {
    const builder = new SemanticTokensBuilder();

    if (!cachedDoc || !cachedDoc.parseResult.ir) {
      return builder.build().data;
    }

    this.collectTokensFromIr(
      cachedDoc.parseResult.ir,
      document,
      builder,
      cachedDoc.parseResult
    );

    return builder.build().data;
  }

  /** Semantic tokens from IR spans + symbol table — not NodeType DFS. */
  private collectTokensFromIr(
    ir: IrDocument,
    document: TextDocument,
    builder: SemanticTokensBuilder,
    parseResult: ParseResult
  ): void {
    const len = document.getText().length;
    walkIr(ir.body, (n) => {
      const span = n.span;
      if (!span) return;
      const start = document.positionAt(Math.max(0, Math.min(span.start, len)));
      const end = document.positionAt(Math.max(0, Math.min(span.end, len)));
      const loc = {
        start: { line: start.line + 1, column: start.character },
        end: { line: end.line + 1, column: end.character },
      };

      if (n.type === "Stmt.Block") {
        this.pushToken(builder, document, loc, SemanticTokenTypes.namespace, [
          SemanticTokenModifiers.declaration,
        ]);
      } else if (n.type === "Stmt.For") {
        this.pushToken(builder, document, loc, SemanticTokenTypes.variable, [
          SemanticTokenModifiers.declaration,
        ]);
      } else if (n.type === "Expr.Ident") {
        const name = n.name;
        const symbolKey = this.findSymbolKey(name, parseResult);
        if (symbolKey) {
          const symbol = parseResult.symbols.get(symbolKey);
          if (symbol) {
            const tokenType = this.getSemanticTokenType(symbol.type);
            const modifiers = this.isDefinition(loc, symbol.definitionRange)
              ? [SemanticTokenModifiers.definition]
              : [];
            this.pushToken(builder, document, loc, tokenType, modifiers);
          }
        } else {
          this.pushToken(builder, document, loc, SemanticTokenTypes.variable, []);
        }
      } else if (n.type === "Expr.Literal") {
        const tokenType =
          typeof n.value === "number" ? SemanticTokenTypes.number : SemanticTokenTypes.string;
        this.pushToken(builder, document, loc, tokenType, []);
      } else if (n.type === "Stmt.Extends" || n.type === "Stmt.Include") {
        this.pushToken(builder, document, loc, SemanticTokenTypes.keyword, []);
      } else if (n.type === "Stmt.If" || n.type === "Stmt.ElseIf" || n.type === "Stmt.Else") {
        this.pushToken(builder, document, loc, SemanticTokenTypes.keyword, []);
      } else if (n.type === "Expr.Pipe") {
        this.pushToken(builder, document, loc, SemanticTokenTypes.function, []);
      }
    });
  }

"""
text = text[:start] + new_sem + text[end:]
print("rewrote semantic tokens")

# Remove dead collectTokens / handleDefaultNode if still present between — already replaced through pushToken

# Clean unused Delimiters import usage if Delimiters type import becomes unused
# Check if Delimiters is still used
if "Delimiters" in text:
    # still referenced maybe in comments — keep import for now
    pass

# Remove adaptIrToProgram from imports if unused
if "adaptIrToProgram" not in text.replace("adaptIrToProgram,", "").replace('adaptIrToProgram', '', 1):
    pass

# Simplify imports: remove adaptIrToProgram if no longer referenced
refs = len(re.findall(r"\badaptIrToProgram\b", text))
print(f"adaptIrToProgram refs: {refs}")
if refs <= 1:  # only in import
    text = text.replace("  adaptIrToProgram,\n", "")
    print("removed adaptIrToProgram import")

# Check Expr.Ident vs Expr.Identifier in IR
p.write_text(text, encoding="utf-8")
print(f"done lines={text.count(chr(10))+1}")
