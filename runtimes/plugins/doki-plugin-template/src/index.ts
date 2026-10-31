import type { HookContext, HookResult, Plugin } from "@doki-land/doki-engine";

export default {
    name: "{{name}}",
    version: "1.0.0",
    description: "{{description}}",

    hooks: {
        async onBeforeBuild(_context: HookContext): Promise<HookResult> {
            console.log("Building site...");
            return { continue: true };
        },

        async onAfterBuild(_context: HookContext): Promise<HookResult> {
            console.log("Build complete!");
            return { continue: true };
        },
    },
} satisfies Plugin;
