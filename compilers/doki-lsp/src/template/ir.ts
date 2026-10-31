/**
 * Engine-backed IR helpers for doki-lsp.
 *
 * Single language contract / single execution path with Dejavu:
 *   source → parse (@doki-land/dejavu, `dejavu.napi/0`) → IrDocument / IrNode
 * Inheritance facts must match renderIr + catalog resolution — not a fork.
 *
 * Forbidden: Program.body / NodeType DFS, and any parallel delimiter "mini-engine"
 * that invents control / inheritance semantics outside @doki-land/dejavu.
 */

import { parse } from "@doki-land/dejavu";

/** Language + delimiter configuration — the `dejavu.napi/0` `delimiters` wire
 * (camelCase, matching the Rust `dejavu_ir::Language`). */
export type TemplateLanguage = {
    syntaxMode: "template";
    template: {
        codeStart: string;
        codeEnd: string;
        commentStart: string;
        commentEnd: string;
        supportFilterPipe: boolean;
        legacyFor: boolean;
    };
};

/** Dejavu default profile (`<% %>` / `<# #>`). */
export const DEFAULT_LANGUAGE: TemplateLanguage = {
    syntaxMode: "template",
    template: {
        codeStart: "<%",
        codeEnd: "%>",
        commentStart: "<#",
        commentEnd: "#>",
        supportFilterPipe: true,
        legacyFor: false,
    },
};

/** Doki profile (`{% %}` / `{# #}`). */
export const DOKI_LANGUAGE: TemplateLanguage = {
    syntaxMode: "template",
    template: {
        codeStart: "{%",
        codeEnd: "%}",
        commentStart: "{#",
        commentEnd: "#}",
        supportFilterPipe: true,
        legacyFor: false,
    },
};

/** UTF-8 byte span, `end` exclusive (engine contract). */
export type IrSpan = { start: number; end: number };

export type IrElseIf = {
    type: "Stmt.ElseIf";
    test: IrNode;
    consequent: IrNode[];
    trim?: string;
    span?: IrSpan;
};

/** IR node vocabulary emitted by `@doki-land/dejavu` `parse` (irVersion 1.0). */
export type IrNode =
    | { type: "Template"; children: IrNode[]; span?: IrSpan }
    | { type: "Text"; value: string; span?: IrSpan }
    | { type: "Comment"; value: string; span?: IrSpan }
    | {
          type: "Interpolation";
          expression: IrNode;
          trim?: string;
          span?: IrSpan;
      }
    | {
          type: "Stmt.If";
          test: IrNode;
          consequent: IrNode[];
          elseIfs: IrElseIf[];
          alternate?: IrNode[];
          trim?: string;
          span?: IrSpan;
      }
    | IrElseIf
    | {
          type: "Stmt.For";
          item: string;
          index?: string;
          iterable: IrNode;
          body: IrNode[];
          trim?: string;
          span?: IrSpan;
      }
    | {
          type: "Stmt.Block";
          name: string;
          body: IrNode[];
          trim?: string;
          span?: IrSpan;
      }
    | { type: "Stmt.Extends"; parent: IrNode; trim?: string; span?: IrSpan }
    | { type: "Stmt.Include"; path: IrNode; trim?: string; span?: IrSpan }
    | { type: "Stmt.Super"; trim?: string; span?: IrSpan }
    | { type: "Expr.Identifier"; name: string; span?: IrSpan }
    | { type: "Expr.Literal"; value: unknown; span?: IrSpan }
    | {
          type: "Expr.Binary";
          operator: string;
          left: IrNode;
          right: IrNode;
          span?: IrSpan;
      }
    | {
          type: "Expr.Unary";
          operator: string;
          argument: IrNode;
          span?: IrSpan;
      }
    | {
          type: "Expr.Member";
          object: IrNode;
          property: string;
          span?: IrSpan;
      }
    | { type: "Expr.Index"; object: IrNode; index: IrNode; span?: IrSpan }
    | {
          type: "Expr.Call";
          callee: IrNode;
          arguments: IrNode[];
          span?: IrSpan;
      }
    | {
          type: "Expr.Pipe";
          expression: IrNode;
          filter: string;
          arguments: IrNode[];
          span?: IrSpan;
      };

export type IrDocument = {
    irVersion: string;
    language: TemplateLanguage;
    body: IrNode;
};

export type IrParseOk = { ok: true; doc: IrDocument };
export type IrParseErr = { ok: false; message: string };
export type IrParseResult = IrParseOk | IrParseErr;

export type IrBlockFact = {
    name: string;
    start: number;
    end: number;
};

export type IrTemplateFacts = {
    extendsPath?: string;
    includes: string[];
    blocks: IrBlockFact[];
    /** loop item names from Stmt.For (engine IR, not VariableDeclaration). */
    loopItems: Array<{ name: string; start: number; end: number }>;
};

/** Normative parse — same entry as runtime / checkTemplate. Throws on
 * error-severity diagnostics (`DejavuError`). */
export function parseTemplate(
    source: string,
    language: TemplateLanguage = DEFAULT_LANGUAGE,
    file = "template.dejavu",
): IrDocument {
    return parse(source, {
        file,
        delimiters: JSON.stringify(language),
    }) as IrDocument;
}

/** Non-throwing wrapper of {@link parseTemplate}. */
export function tryParseToIr(
    source: string,
    language?: TemplateLanguage,
    file = "template.dejavu",
): IrParseResult {
    try {
        const doc = parseTemplate(source, language ?? DEFAULT_LANGUAGE, file);
        return { ok: true, doc };
    } catch (e) {
        return {
            ok: false,
            message: e instanceof Error ? e.message : String(e),
        };
    }
}

/** Depth-first walk of IrNode (engine IR only — not legacy Program AST). */
export function walkIr(node: IrNode, visit: (n: IrNode) => void): void {
    visit(node);
    switch (node.type) {
        case "Template":
            for (const c of node.children) walkIr(c, visit);
            break;
        case "Interpolation":
            walkIr(node.expression, visit);
            break;
        case "Stmt.If":
            walkIr(node.test, visit);
            for (const c of node.consequent) walkIr(c, visit);
            for (const ei of node.elseIfs) walkIr(ei, visit);
            if (node.alternate)
                for (const c of node.alternate) walkIr(c, visit);
            break;
        case "Stmt.ElseIf":
            walkIr(node.test, visit);
            for (const c of node.consequent) walkIr(c, visit);
            break;
        case "Stmt.For":
            walkIr(node.iterable, visit);
            for (const c of node.body) walkIr(c, visit);
            break;
        case "Stmt.Block":
            for (const c of node.body) walkIr(c, visit);
            break;
        case "Stmt.Extends":
            walkIr(node.parent, visit);
            break;
        case "Stmt.Include":
            walkIr(node.path, visit);
            break;
        case "Expr.Member":
            walkIr(node.object, visit);
            break;
        case "Expr.Index":
            walkIr(node.object, visit);
            walkIr(node.index, visit);
            break;
        case "Expr.Call":
            walkIr(node.callee, visit);
            for (const a of node.arguments) walkIr(a, visit);
            break;
        case "Expr.Binary":
            walkIr(node.left, visit);
            walkIr(node.right, visit);
            break;
        case "Expr.Unary":
            walkIr(node.argument, visit);
            break;
        case "Expr.Pipe":
            walkIr(node.expression, visit);
            for (const a of node.arguments) walkIr(a, visit);
            break;
        default:
            break;
    }
}

function literalPath(node: IrNode): string | undefined {
    if (node.type === "Expr.Literal" && typeof node.value === "string") {
        return node.value;
    }
    return undefined;
}

/**
 * Structural facts from normative IR (extends / include / block / loop).
 * Aligns with renderIr inheritance inputs — child block names override parents.
 */
export function extractTemplateFacts(doc: IrDocument): IrTemplateFacts {
    let extendsPath: string | undefined;
    const includes: string[] = [];
    const blocks: IrBlockFact[] = [];
    const loopItems: IrTemplateFacts["loopItems"] = [];

    walkIr(doc.body, (n) => {
        if (n.type === "Stmt.Extends" && !extendsPath) {
            extendsPath = literalPath(n.parent);
        } else if (n.type === "Stmt.Include") {
            const p = literalPath(n.path);
            if (p) includes.push(p);
        } else if (n.type === "Stmt.Block") {
            blocks.push({
                name: n.name,
                start: n.span?.start ?? 0,
                end: n.span?.end ?? 0,
            });
        } else if (n.type === "Stmt.For") {
            loopItems.push({
                name: n.item,
                start: n.span?.start ?? 0,
                end: n.span?.end ?? 0,
            });
            if (n.index) {
                loopItems.push({
                    name: n.index,
                    start: n.span?.start ?? 0,
                    end: n.span?.end ?? 0,
                });
            }
        }
    });

    return { extendsPath, includes, blocks, loopItems };
}

/** Engine language template delimiters (canonical config — not LSP-invented). */
export function languageDelimiters(language?: TemplateLanguage): {
    codeStart: string;
    codeEnd: string;
    commentStart: string;
    commentEnd: string;
} {
    const t = (language ?? DEFAULT_LANGUAGE).template;
    return {
        codeStart: t.codeStart,
        codeEnd: t.codeEnd,
        commentStart: t.commentStart,
        commentEnd: t.commentEnd,
    };
}
