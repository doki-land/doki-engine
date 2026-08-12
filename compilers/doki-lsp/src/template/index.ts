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
  tryParseToIr,
  walkIr,
  extractTemplateFacts,
  languageDelimiters,
  type IrParseResult,
  type IrTemplateFacts,
  type IrBlockFact,
} from "./ir";

export {
  scanTemplateRegions,
  offsetInCodeRegion,
  type Delimiters,
  type TemplateRegion,
  type TemplateRegionKind,
} from "./scan";

export {
  classifyCodeHead,
  type CodeHead,
  type CodeHeadKind,
} from "./heads";

export {
  analyzeTemplateSource,
  buildParentChain,
  mergeBlockOverrides,
  emptyGraph,
  type BlockDef,
  type TemplateNode,
  type TemplateGraph,
} from "./graph";

export {
  detectCursorContext,
  type CursorContext,
  type CursorContextKind,
} from "./context";

export {
  collectStructuralDiagnostics,
  diagnosticFromParseError,
  type TemplateDiagnostic,
} from "./diagnostics";
