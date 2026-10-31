/**
 * Diagnostics grounded in parseToIr — the same check path as DejavuEngine.checkTemplate.
 *
 * Do not maintain a parallel control-stack / delimiter semantic checker that can
 * disagree with the engine. Incomplete-buffer UX may still classify cursor offsets
 * via Language.template delimiters (see context.ts) without inventing grammar rules.
 */

import { tryParseToIr, type TemplateLanguage } from "./ir";

export type TemplateDiagnostic = {
    message: string;
    start: number;
    end: number;
    code: "parse_error";
};

/**
 * Collect diagnostics by running the normative parser.
 * Empty when source parses cleanly under the given Language.
 */
export function collectStructuralDiagnostics(
    source: string,
    language?: TemplateLanguage,
    file = "template.dejavu",
): TemplateDiagnostic[] {
    const parsed = tryParseToIr(source, language, file);
    if (parsed.ok) return [];
    return [
        diagnosticFromParseError(
            parsed.message,
            0,
            Math.max(1, Math.min(source.length, 1)),
        ),
    ];
}

/** Wrap a parse failure (from parseToIr / checkTemplate) as a diagnostic. */
export function diagnosticFromParseError(
    message: string,
    start = 0,
    end = 1,
): TemplateDiagnostic {
    return { message, start, end, code: "parse_error" };
}
