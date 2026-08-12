import { describe, it, expect } from "vitest";
import plugin from "../src/index";

describe("plugin-template", () => {
    it("should have correct name", () => {
        expect(plugin.name).toBe("template");
    });

    it("should have correct version", () => {
        expect(plugin.version).toBe("1.0.0");
    });

    it("should have hooks defined", () => {
        expect(plugin.hooks).toBeDefined();
        expect(plugin.hooks.onBeforeBuild).toBeDefined();
        expect(plugin.hooks.onAfterBuild).toBeDefined();
    });

    it("should return continue true from hooks", async () => {
        const context = {} as any;

        const beforeResult = await plugin.hooks.onBeforeBuild(context);
        expect(beforeResult.continue).toBe(true);

        const afterResult = await plugin.hooks.onAfterBuild(context);
        expect(afterResult.continue).toBe(true);
    });
});
