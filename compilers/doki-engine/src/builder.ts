/**
 * RETIRED — TypeScript Builder is no longer a build authority.
 *
 * Formal product entry: `@doki-land/doki` (Node CLI) → `@doki-land/doki-core` (N-API)
 * → Rust `doki-core`.
 *
 * This module only keeps a few type aliases so transitional imports compile;
 * calling `Builder` / `buildSite` throws.
 */

export interface BuildResult {
    contentCount: number;
    outputDir?: string;
    [key: string]: unknown;
}

const RETIRED = [
    "The TypeScript Builder has been deleted as a build authority.",
    "Use `@doki-land/doki` (`doki build`) which drives the Rust N-API kernel.",
].join(" ");

/** @deprecated Use `@doki-land/doki` */
export class Builder {
    constructor() {
        throw new Error(RETIRED);
    }
}

/** @deprecated Use `@doki-land/doki` */
export async function buildSite(_root?: string): Promise<BuildResult> {
    throw new Error(RETIRED);
}
