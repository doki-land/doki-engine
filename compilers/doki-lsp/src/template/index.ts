/**
 * Template LSP analysis — grounded in Dejavu engine execution path.
 *
 * Contract:
 *   source → parseToIr → IrDocument (same as runtime / renderIr inputs)
 * Delimiter scan exists only for incomplete-buffer cursor offsets using
 * Language.template from the engine — never as a second semantic model.
 *
 * Do NOT expand Program.body / NodeType DFS in `src/index.ts`.
 */

export {
    type CursorContext,
    type CursorContextKind,
    detectCursorContext,
} from "./context";
export {
    collectStructuralDiagnostics,
    diagnosticFromParseError,
    type TemplateDiagnostic,
} from "./diagnostics";
export {
    analyzeTemplateSource,
    type BlockDef,
    buildParentChain,
    emptyGraph,
    mergeBlockOverrides,
    type TemplateGraph,
    type TemplateNode,
} from "./graph";
export {
    type CodeHead,
    type CodeHeadKind,
    classifyCodeHead,
} from "./heads";
export {
    extractTemplateFacts,
    type IrBlockFact,
    type IrParseResult,
    type IrTemplateFacts,
    languageDelimiters,
    tryParseToIr,
    walkIr,
} from "./ir";
export {
    type Delimiters,
    offsetInCodeRegion,
    scanTemplateRegions,
    type TemplateRegion,
    type TemplateRegionKind,
} from "./scan";
