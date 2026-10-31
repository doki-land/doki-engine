import { describe, expect, it } from "vitest";
import type { BuildResult } from "../src/builder.js";
import {
    type HookContext,
    type HookType,
    type Plugin,
    PluginManager,
} from "../src/plugin.js";

/**
 * The transitional TS PluginManager is retired: official plugins run through
 * `@doki-land/plugin` and the Rust segmented build protocol. These tests pin
 * the retirement contract — every entry point must fail with guidance, never
 * silently accept work.
 */
describe("PluginManager (retired)", () => {
    const RETIRED = /retired/i;

    it("use() throws the retirement guidance", () => {
        const plugin: Plugin = { name: "test-plugin", hooks: {} };
        expect(() => new PluginManager().use(plugin)).toThrow(RETIRED);
    });

    it("run() rejects with the retirement guidance", async () => {
        const hook: HookType = "beforeBuild";
        const ctx: HookContext = {};
        await expect(new PluginManager().run(hook, ctx)).rejects.toThrow(RETIRED);
    });

    it("afterBuild() rejects with the retirement guidance", async () => {
        const manager = new PluginManager();
        await expect(
            manager.afterBuild(null as unknown as BuildResult),
        ).rejects.toThrow(RETIRED);
    });
});
