/**
 * RETIRED transitional PluginManager — not a build authority.
 *
 * Official plugins use `@doki-land/plugin` + the segmented N-API hook protocol
 * driven by `@doki-land/doki`. See `决策和进度表/doki-rust-build-kernel.md`.
 */

import type { BuildResult } from "./builder.js";

export type HookType =
    | "beforeBuild"
    | "afterBuild"
    | "transformContent"
    | "generateContent";

export interface HookContext {
    [key: string]: unknown;
}

export interface Plugin {
    name: string;
    hooks?: Partial<
        Record<HookType, (ctx: HookContext) => unknown | Promise<unknown>>
    >;
}

const RETIRED =
    "PluginManager is retired. Use @doki-land/plugin with the Rust segmented build protocol via @doki-land/doki.";

/** @deprecated */
export class PluginManager {
    use(_plugin: Plugin): this {
        throw new Error(RETIRED);
    }

    async run(_hook: HookType, _ctx: HookContext): Promise<void> {
        throw new Error(RETIRED);
    }

    /** @deprecated */
    async afterBuild(_result: BuildResult): Promise<void> {
        throw new Error(RETIRED);
    }
}
