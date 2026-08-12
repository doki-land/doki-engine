import type { Plugin, HookContext, HookResult } from "@doki-land/doki-engine";

export default {
    name: "{{name}}",
    version: "1.0.0",
    description: "{{description}}",

    hooks: {
        async onBeforeBuild(context: HookContext): Promise<HookResult> {
            console.log("Building site...");
            return { continue: true };
        },

        async onAfterBuild(context: HookContext): Promise<HookResult> {
            console.log("Build complete!");
            return { continue: true };
        },
    },
} satisfies Plugin;
