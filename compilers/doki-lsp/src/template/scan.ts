/**
 * Delimiter offset helpers using engine Language.template only.
 *
 * These do NOT classify if/loop/block semantics — that belongs to parseToIr.
 * Used only when the buffer is incomplete and we need to know whether the cursor
 * sits inside code vs markup delimiters for completion UX.
 */

export type Delimiters = {
  codeStart: string;
  codeEnd: string;
  commentStart: string;
  commentEnd: string;
};

export type TemplateRegionKind = "markup" | "code" | "comment";

export type TemplateRegion = {
  kind: TemplateRegionKind;
  start: number;
  end: number;
  inner: string;
  innerStart: number;
};

/**
 * Linear split by Language.template delimiters (canonical config from engine).
 * Not a second template parser — offsets only.
 */
export function scanTemplateRegions(
  source: string,
  delimiters: Delimiters,
): TemplateRegion[] {
  const { codeStart, codeEnd, commentStart, commentEnd } = delimiters;
  const regions: TemplateRegion[] = [];
  let i = 0;

  while (i < source.length) {
    const nextCode = source.indexOf(codeStart, i);
    const nextComment = source.indexOf(commentStart, i);
    let next = -1;
    let kind: "code" | "comment" | null = null;

    if (nextCode === -1 && nextComment === -1) {
      if (i < source.length) {
        regions.push({
          kind: "markup",
          start: i,
          end: source.length,
          inner: source.slice(i),
          innerStart: i,
        });
      }
      break;
    }

    if (nextCode === -1) {
      next = nextComment;
      kind = "comment";
    } else if (nextComment === -1) {
      next = nextCode;
      kind = "code";
    } else if (nextComment < nextCode) {
      next = nextComment;
      kind = "comment";
    } else {
      next = nextCode;
      kind = "code";
    }

    if (next > i) {
      regions.push({
        kind: "markup",
        start: i,
        end: next,
        inner: source.slice(i, next),
        innerStart: i,
      });
    }

    if (kind === "comment") {
      const open = commentStart.length;
      const closeAt = source.indexOf(commentEnd, next + open);
      if (closeAt === -1) {
        regions.push({
          kind: "comment",
          start: next,
          end: source.length,
          inner: source.slice(next + open),
          innerStart: next + open,
        });
        break;
      }
      const end = closeAt + commentEnd.length;
      regions.push({
        kind: "comment",
        start: next,
        end,
        inner: source.slice(next + open, closeAt),
        innerStart: next + open,
      });
      i = end;
      continue;
    }

    const open = codeStart.length;
    const closeAt = source.indexOf(codeEnd, next + open);
    if (closeAt === -1) {
      regions.push({
        kind: "code",
        start: next,
        end: source.length,
        inner: source.slice(next + open),
        innerStart: next + open,
      });
      break;
    }
    const end = closeAt + codeEnd.length;
    regions.push({
      kind: "code",
      start: next,
      end,
      inner: source.slice(next + open, closeAt),
      innerStart: next + open,
    });
    i = end;
  }

  return regions;
}

export function offsetInCodeRegion(
  regions: TemplateRegion[],
  offset: number,
): TemplateRegion | undefined {
  return regions.find(
    (r) => r.kind === "code" && offset >= r.start && offset <= r.end,
  );
}
