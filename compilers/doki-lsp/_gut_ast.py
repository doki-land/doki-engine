from pathlib import Path
import re

p = Path(r"src/index.ts")
text = p.read_text(encoding="utf-8")
orig_len = len(text)


def replace_method(text, start_pat, end_pat, new_body, label):
    m = re.search(start_pat, text)
    if not m:
        raise SystemExit(f"START not found: {label}")
    start = m.start()
    m2 = re.search(end_pat, text[m.end() :])
    if not m2:
        raise SystemExit(f"END not found: {label}")
    end = m.end() + m2.start()
    print(f"{label}: replacing [{start}:{end}] ({end - start} chars)")
    return text[:start] + new_body + text[end:]


marker = """  private collectImportsAndExtends(
    _node: Node,
    _imports: ImportInfo[],
    _document: TextDocument,
    _setExtends: (template: string) => void
  ): void {
    // gutted
  }
"""
idx = text.find(marker)
if idx < 0:
    raise SystemExit("gutted collectImportsAndExtends not found")
after = idx + len(marker)
end = text.find("  /**\n   * 提取错误信息\n   */\n  private extractErrorInfo", after)
if end < 0:
    raise SystemExit("extractErrorInfo not found after orphan")
print(f"orphan remove [{after}:{end}] ({end - after} chars)")
text = text[:after] + "\n" + text[end:]

text = replace_method(
    text,
    r"  /\*\*\n   \* 尝试部分解析\n   \*/\n  private attemptPartialParse\(",
    r"  /\*\*\n   \* 提取代码块\n   \*/\n  private extractCodeBlocks\(",
    """  /**
   * @deprecated Partial Program reconstruction removed — use tryParseToIr only.
   */
  private attemptPartialParse(
    _content: string,
    _language: DejavuLanguage,
    _errors: ParseError[]
  ): Program | null {
    return null;
  }

  /** @deprecated Recovery regex Program stubs removed. */
  private attemptRecoveryParse(
    _content: string,
    _language: DejavuLanguage,
    _errorRange: Range
  ): any[] {
    return [];
  }

""",
    "attemptPartialParse+recovery",
)

text = replace_method(
    text,
    r"  /\*\*\n   \* 提取代码块\n   \*/\n  private extractCodeBlocks\(",
    r"  /\*\*\n   \* 获取位置对应的行列信息\n   \*/\n  private getLineInfo\(",
    """  /** @deprecated Code-block slice for legacy Parser removed. */
  private extractCodeBlocks(
    _content: string,
    _language: DejavuLanguage
  ): { content: string; range: Range }[] {
    return [];
  }

""",
    "extractCodeBlocks",
)

text = replace_method(
    text,
    r"  /\*\*\n   \* 回退符号提取（使用正则表达式）\n   \*/\n  private fallbackSymbolExtraction\(",
    r"  /\*\*\n   \* 构建符号表和作用域链\n   \*/\n  private buildSymbolTable\(",
    """  /**
   * @deprecated Regex symbol extraction removed — use buildSymbolsFromIr.
   */
  private fallbackSymbolExtraction(
    _content: string,
    _symbols: Map<string, SymbolInfo>,
    _scopes: Map<number, Scope>,
    _rootScopeId: number,
    _document: TextDocument
  ): void {
    // gutted
  }

""",
    "fallbackSymbolExtraction",
)

text = replace_method(
    text,
    r"  /\*\*\n   \* 构建符号表和作用域链\n   \*/\n  private buildSymbolTable\(",
    r"  /\*\*\n   \* 添加符号到符号表\n   \*/\n  private addSymbol\(",
    """  /**
   * @deprecated NodeType DFS removed — use buildSymbolsFromIr.
   */
  private buildSymbolTable(
    _node: Node,
    _symbols: Map<string, SymbolInfo>,
    _scopes: Map<number, Scope>,
    _currentScopeId: number,
    _document: TextDocument
  ): void {
    // gutted — do not walk Program.body / NodeType
  }

""",
    "buildSymbolTable",
)

old_adapt = """      try {
        ast = adaptIrToProgram(ir, content);
      } catch {
        ast = null;
      }
"""
new_adapt = """      // Legacy Program bridge intentionally unused — IR is the only language surface.
      ast = null;
"""
if old_adapt not in text:
    raise SystemExit("adaptIrToProgram block not found")
text = text.replace(old_adapt, new_adapt, 1)
print("cleared adaptIrToProgram")

old_diag = """    // Template-native structural checks (delimiter scan + control stack) — not NodeType DFS.
    diagnostics.push(...this.getTemplateNativeDiagnostics(document, diagnosticsConfig));
"""
new_diag = """    // Normative parseToIr diagnostics (same check path as engine) — not NodeType DFS.
    diagnostics.push(...this.getTemplateNativeDiagnostics(document, diagnosticsConfig));
"""
if old_diag not in text:
    print("WARN: diag comment block not exact")
else:
    text = text.replace(old_diag, new_diag, 1)

old_native = """  /**
   * Structural diagnostics from `./template` (scan + heads), not Program AST walk.
   */
  private getTemplateNativeDiagnostics(
    document: TextDocument,
    diagnosticsConfig: DiagnosticsConfig,
  ): Diagnostic[] {
    const config = this.languageManager.getLanguageFromUri(document.uri);
    const delimiters: Delimiters = {
      codeStart: config.codeStart,
      codeEnd: config.codeEnd,
      commentStart: config.commentStart,
      commentEnd: config.commentEnd,
    };
    const text = document.getText();
    const structural = collectStructuralDiagnostics(text, delimiters);
"""
new_native = """  /**
   * Diagnostics from parseToIr via `./template` — not Program AST walk / control-stack scan.
   */
  private getTemplateNativeDiagnostics(
    document: TextDocument,
    diagnosticsConfig: DiagnosticsConfig,
  ): Diagnostic[] {
    const language = this.languageManager.getDejavuLanguage(document.uri);
    const text = document.getText();
    const structural = collectStructuralDiagnostics(text, language, document.uri);
"""
if old_native not in text:
    raise SystemExit("getTemplateNativeDiagnostics block not found")
text = text.replace(old_native, new_native, 1)
print("rewired getTemplateNativeDiagnostics")

old_ctx = """    // Prefer template-native cursor context (delimiter regions) before line heuristics.
    const lang = LanguageConfigManager.getInstance().getLanguageFromUri(document.uri);
    const native = detectCursorContext(content, offset, {
      codeStart: lang.codeStart,
      codeEnd: lang.codeEnd,
      commentStart: lang.commentStart,
      commentEnd: lang.commentEnd,
    });
"""
new_ctx = """    // Prefer IR-backed cursor context; delimiter offsets only for incomplete buffers.
    const langMgr = LanguageConfigManager.getInstance();
    const lang = langMgr.getLanguageFromUri(document.uri);
    const dejavuLang = langMgr.getDejavuLanguage(document.uri);
    const native = detectCursorContext(content, offset, {
      codeStart: lang.codeStart,
      codeEnd: lang.codeEnd,
      commentStart: lang.commentStart,
      commentEnd: lang.commentEnd,
    }, dejavuLang);
"""
if old_ctx not in text:
    raise SystemExit("detectContext block not found")
text = text.replace(old_ctx, new_ctx, 1)
print("rewired detectContext")

p.write_text(text, encoding="utf-8")
print(f"done: {orig_len} -> {len(text)} chars, lines={text.count(chr(10)) + 1}")
