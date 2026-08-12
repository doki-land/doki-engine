/**
 * Cursor context for completions.
 *
 * Prefers IR when the buffer parses; falls back to Language.template delimiter
 * offsets + vocabulary-aligned head labels for incomplete tags.
 * Pipe operator is `|>` only (engine contract).
 */

import { classifyCodeHead, type CodeHeadKind } from "./heads";
import { tryParseToIr, walkIr } from "./ir";
import {
  offsetInCodeRegion,
  scanTemplateRegions,
  type Delimiters,
  type TemplateRegion,
} from "./scan";
import type { Language } from "@doki-land/dejavu-engine";

export type CursorContextKind =
  | "markup"
  | "comment"
  | "code_tag_start"
  | "code_keyword"
  | "code_expr"
  | "filter_pipe"
  | "block_name"
  | "extends_path"
  | "include_path";

export type CursorContext = {
  kind: CursorContextKind;
  region?: TemplateRegion;
  headKind?: CodeHeadKind;
  beforeCursor: string;
  /** True when context was refined from a successful parseToIr. */
  fromIr?: boolean;
};

/**
 * Classify where the cursor sits for completion / hover.
 */
export function detectCursorContext(
  source: string,
  offset: number,
  delimiters: Delimiters,
  language?: Language | { asLanguage(): Language },
): CursorContext {
  // Filter pipe: contract is `|>` — detectable even on incomplete buffers.
  const before = source.slice(Math.max(0, offset - 40), offset);
  if (/\|>\s*[\w]*$/.test(before)) {
    const regions = scanTemplateRegions(source, delimiters);
    const region = offsetInCodeRegion(regions, offset);
    return {
      kind: "filter_pipe",
      region,
      beforeCursor: before,
      headKind: "expr",
      fromIr: false,
    };
  }

  const parsed = tryParseToIr(source, language);
  if (parsed.ok) {
    let hit: CursorContextKind | undefined;
    let headKind: CodeHeadKind | undefined;
    walkIr(parsed.doc.body, (n) => {
      const span = (n as { span?: { start: number; end: number } }).span;
      if (!span || offset < span.start || offset > span.end) return;
      if (n.type === "Stmt.Extends") {
        hit = "extends_path";
        headKind = "extends";
      } else if (n.type === "Stmt.Include") {
        hit = "include_path";
        headKind = "include";
      } else if (n.type === "Stmt.Block") {
        hit = "block_name";
        headKind = "block";
      } else if (
        n.type === "Stmt.If" ||
        n.type === "Stmt.ElseIf" ||
        n.type === "Stmt.For"
      ) {
        hit = "code_keyword";
        headKind =
          n.type === "Stmt.For" ? "loop" : n.type === "Stmt.ElseIf" ? "else_if" : "if";
      } else if (n.type === "Interpolation" || n.type === "Expr.Pipe") {
        hit = "code_expr";
        headKind = "expr";
      }
    });
    if (hit) {
      return {
        kind: hit,
        beforeCursor: before,
        headKind,
        fromIr: true,
      };
    }
  }

  const regions = scanTemplateRegions(source, delimiters);
  const region = regions.find((r) => offset >= r.start && offset <= r.end);

  if (!region || region.kind === "markup") {
    return {
      kind: "markup",
      region,
      beforeCursor: before,
      fromIr: false,
    };
  }
  if (region.kind === "comment") {
    return { kind: "comment", region, beforeCursor: "", fromIr: false };
  }

  const beforeInRegion = source.slice(region.innerStart, Math.min(offset, region.end));
  const head = classifyCodeHead(region.inner);
  const trimmed = beforeInRegion.trimStart();

  if (trimmed.length === 0 || /^[A-Za-z_]*$/.test(trimmed)) {
    return {
      kind: "code_tag_start",
      region,
      beforeCursor: beforeInRegion,
      headKind: head.kind,
      fromIr: false,
    };
  }

  if (head.kind === "block" && !head.name) {
    return {
      kind: "block_name",
      region,
      beforeCursor: beforeInRegion,
      headKind: "block",
      fromIr: false,
    };
  }
  if (head.kind === "extends") {
    return {
      kind: "extends_path",
      region,
      beforeCursor: beforeInRegion,
      headKind: "extends",
      fromIr: false,
    };
  }
  if (head.kind === "include") {
    return {
      kind: "include_path",
      region,
      beforeCursor: beforeInRegion,
      headKind: "include",
      fromIr: false,
    };
  }
  if (
    head.kind === "if" ||
    head.kind === "loop" ||
    head.kind === "else_if" ||
    head.kind === "end_if" ||
    head.kind === "end_loop" ||
    head.kind === "end_block"
  ) {
    return {
      kind: "code_keyword",
      region,
      beforeCursor: beforeInRegion,
      headKind: head.kind,
      fromIr: false,
    };
  }

  return {
    kind: "code_expr",
    region,
    beforeCursor: beforeInRegion,
    headKind: head.kind,
    fromIr: false,
  };
}
