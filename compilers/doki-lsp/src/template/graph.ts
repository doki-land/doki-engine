/**
 * Template graph facts from normative IR (parseToIr).
 *
 * Inheritance chain loading mirrors engine TemplateLoader usage:
 * parse each parent with the same parser; child block map overrides parents
 * the same way renderIr.resolveInheritance merges Stmt.Block bodies.
 *
 * Do not invent a second extends/block ruleset from delimiter scans.
 */

import type { Language } from "@doki-land/dejavu-engine";
import { extractTemplateFacts, type IrTemplateFacts, tryParseToIr } from "./ir";

export type BlockDef = {
    name: string;
    start: number;
    end: number;
};

export type TemplateNode = {
    path: string;
    extendsPath?: string;
    includes: string[];
    blocks: Map<string, BlockDef>;
    /** Normative IR facts when parse succeeded. */
    facts?: IrTemplateFacts;
};

export type TemplateGraph = {
    nodes: Map<string, TemplateNode>;
};

function factsToNode(path: string, facts: IrTemplateFacts): TemplateNode {
    const blocks = new Map<string, BlockDef>();
    for (const b of facts.blocks) {
        blocks.set(b.name, { name: b.name, start: b.start, end: b.end });
    }
    return {
        path,
        extendsPath: facts.extendsPath,
        includes: [...facts.includes],
        blocks,
        facts,
    };
}

/**
 * Build a single-file template node via parseToIr (engine path).
 * Returns an empty node shell when parse fails (caller may surface parse_error).
 */
export function analyzeTemplateSource(
    path: string,
    source: string,
    language?: Language | { asLanguage(): Language },
): TemplateNode {
    const parsed = tryParseToIr(source, language, path);
    if (!parsed.ok) {
        return { path, includes: [], blocks: new Map() };
    }
    return factsToNode(path, extractTemplateFacts(parsed.doc));
}

/**
 * Parent chain for `startPath` using a loader — same graph shape the engine
 * walks for extends (stop on missing / cycle). Does not reimplement block merge
 * beyond collecting paths; use {@link mergeBlockOverrides} for name→def maps.
 */
export function buildParentChain(
    startPath: string,
    load: (path: string) => string | null,
    resolve: (from: string, rel: string) => string,
    language?: Language | { asLanguage(): Language },
): string[] {
    const chain: string[] = [];
    const seen = new Set<string>();
    let current: string | undefined = startPath;

    while (current) {
        if (seen.has(current)) break;
        seen.add(current);
        const source = load(current);
        if (source == null) break;
        const node = analyzeTemplateSource(current, source, language);
        if (!node.extendsPath) break;
        const parent = resolve(current, node.extendsPath);
        chain.push(parent);
        current = parent;
    }

    return chain;
}

/**
 * Merge block override map along parents (child wins).
 * Mirrors renderIr child-over-parent Stmt.Block override direction.
 */
export function mergeBlockOverrides(
    local: Map<string, BlockDef>,
    parentBlocksOldestFirst: Array<Map<string, BlockDef>>,
): Map<string, BlockDef> {
    const merged = new Map<string, BlockDef>();
    for (const parent of parentBlocksOldestFirst) {
        for (const [name, def] of parent) {
            if (!merged.has(name)) merged.set(name, def);
        }
    }
    for (const [name, def] of local) {
        merged.set(name, def);
    }
    return merged;
}

export function emptyGraph(): TemplateGraph {
    return { nodes: new Map() };
}
