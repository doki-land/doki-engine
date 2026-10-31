/**
 * Lightweight code-head label for incomplete buffers (completion UX only).
 *
 * Vocabulary matches Dejavu template IR statement kinds (if / loop / block /
 * extends / include / super). Truth for structure is still parseToIr — this
 * must not diverge into a second grammar.
 */

export type CodeHeadKind =
    | "if"
    | "else"
    | "else_if"
    | "end_if"
    | "loop"
    | "end_loop"
    | "block"
    | "end_block"
    | "extends"
    | "include"
    | "super"
    | "expr"
    | "unknown";

export type CodeHead = {
    kind: CodeHeadKind;
    text: string;
    name?: string;
    arg?: string;
};

function firstIdent(s: string): string | undefined {
    const m = /^\s*([A-Za-z_][\w]*)/.exec(s);
    return m?.[1];
}

/** Prefix classify for incomplete tags — not a semantic analyzer. */
export function classifyCodeHead(inner: string): CodeHead {
    const text = inner.trim();
    if (!text) return { kind: "unknown", text };

    const tokens = text.split(/\s+/);
    const t0 = tokens[0]?.toLowerCase();
    const t1 = tokens[1]?.toLowerCase();

    if (t0 === "if")
        return { kind: "if", text, arg: text.slice(2).trim() || undefined };
    if (t0 === "else" && t1 === "if") {
        return {
            kind: "else_if",
            text,
            arg:
                text.slice(text.toLowerCase().indexOf("if") + 2).trim() ||
                undefined,
        };
    }
    if (t0 === "else") return { kind: "else", text };
    if (t0 === "end" && t1 === "if") return { kind: "end_if", text };
    if (t0 === "end" && t1 === "loop") return { kind: "end_loop", text };
    if (t0 === "end" && t1 === "block") return { kind: "end_block", text };

    if (t0 === "loop") {
        const inIdx = tokens.findIndex((t) => t.toLowerCase() === "in");
        const item = inIdx > 0 ? tokens[1] : firstIdent(text.slice(4));
        const iterable =
            inIdx >= 0 ? tokens.slice(inIdx + 1).join(" ") : undefined;
        return { kind: "loop", text, name: item, arg: iterable };
    }

    if (t0 === "block") return { kind: "block", text, name: tokens[1] };
    if (t0 === "extends") {
        return {
            kind: "extends",
            text,
            arg: tokens.slice(1).join(" ") || undefined,
        };
    }
    if (t0 === "include") {
        return {
            kind: "include",
            text,
            arg: tokens.slice(1).join(" ") || undefined,
        };
    }
    if (t0 === "super") return { kind: "super", text };

    return { kind: "expr", text, name: firstIdent(text) };
}
