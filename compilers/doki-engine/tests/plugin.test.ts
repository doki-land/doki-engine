import { describe, it, expect, beforeEach, vi } from "vitest";
import { PluginManager, Plugin, HookContext, HookType } from "../src/plugin.js";

describe("PluginManager", () => {
    let manager: PluginManager;

    beforeEach(() => {
        manager = new PluginManager();
    });

    describe("插件注册", () => {
        it("应该成功注册插件", () => {
            const plugin: Plugin = {
                name: "test-plugin",
                version: "1.0.0",
                hooks: {},
            };

            manager.registerPlugin(plugin);

            expect(manager.getPlugin("test-plugin")).toBe(plugin);
        });

        it("注册重复插件时应该跳过", () => {
            const plugin1: Plugin = {
                name: "test-plugin",
                version: "1.0.0",
                hooks: {},
            };

            const plugin2: Plugin = {
                name: "test-plugin",
                version: "2.0.0",
                hooks: {},
            };

            manager.registerPlugin(plugin1);
            manager.registerPlugin(plugin2);

            expect(manager.getPlugin("test-plugin")?.version).toBe("1.0.0");
        });

        it("应该能够获取所有已注册的插件", () => {
            const plugin1: Plugin = {
                name: "plugin-1",
                version: "1.0.0",
                hooks: {},
            };

            const plugin2: Plugin = {
                name: "plugin-2",
                version: "1.0.0",
                hooks: {},
            };

            manager.registerPlugin(plugin1);
            manager.registerPlugin(plugin2);

            const allPlugins = manager.getAllPlugins();
            expect(allPlugins).toHaveLength(2);
            expect(allPlugins.map((p) => p.name)).toContain("plugin-1");
            expect(allPlugins.map((p) => p.name)).toContain("plugin-2");
        });
    });

    describe("Hook 执行顺序", () => {
        it("应该按照注册顺序执行 Hook", async () => {
            const executionOrder: string[] = [];

            const plugin1: Plugin = {
                name: "plugin-1",
                version: "1.0.0",
                hooks: {
                    onBeforeBuild: async () => {
                        executionOrder.push("plugin-1");
                        return { continue: true };
                    },
                },
            };

            const plugin2: Plugin = {
                name: "plugin-2",
                version: "1.0.0",
                hooks: {
                    onBeforeBuild: async () => {
                        executionOrder.push("plugin-2");
                        return { continue: true };
                    },
                },
            };

            manager.registerPlugin(plugin1);
            manager.registerPlugin(plugin2);

            const context: HookContext = {
                config: {} as any,
            };

            await manager.executeHook("onBeforeBuild", context);

            expect(executionOrder).toEqual(["plugin-1", "plugin-2"]);
        });

        it("当 Hook 返回 continue: false 时应该停止执行", async () => {
            const executionOrder: string[] = [];

            const plugin1: Plugin = {
                name: "plugin-1",
                version: "1.0.0",
                hooks: {
                    onBeforeBuild: async () => {
                        executionOrder.push("plugin-1");
                        return { continue: false };
                    },
                },
            };

            const plugin2: Plugin = {
                name: "plugin-2",
                version: "1.0.0",
                hooks: {
                    onBeforeBuild: async () => {
                        executionOrder.push("plugin-2");
                        return { continue: true };
                    },
                },
            };

            manager.registerPlugin(plugin1);
            manager.registerPlugin(plugin2);

            const context: HookContext = {
                config: {} as any,
            };

            await manager.executeHook("onBeforeBuild", context);

            expect(executionOrder).toEqual(["plugin-1"]);
        });
    });

    describe("异步 Hook", () => {
        it("应该正确处理异步 Hook", async () => {
            const plugin: Plugin = {
                name: "async-plugin",
                version: "1.0.0",
                hooks: {
                    onBeforeBuild: async () => {
                        await new Promise((resolve) => setTimeout(resolve, 10));
                        return {
                            continue: true,
                            context: { data: { async: true } },
                        };
                    },
                },
            };

            manager.registerPlugin(plugin);

            const context: HookContext = {
                config: {} as any,
            };

            const result = await manager.executeHook("onBeforeBuild", context);

            expect(result.data).toEqual({ async: true });
        });

        it("应该处理 Hook 中的错误", async () => {
            const plugin: Plugin = {
                name: "error-plugin",
                version: "1.0.0",
                hooks: {
                    onBeforeBuild: async () => {
                        throw new Error("Hook error");
                    },
                },
            };

            manager.registerPlugin(plugin);

            const context: HookContext = {
                config: {} as any,
            };

            const result = await manager.executeHook("onBeforeBuild", context);

            expect(result).toBeDefined();
        });
    });

    describe("上下文传递", () => {
        it("应该在 Hook 之间传递上下文", async () => {
            const plugin1: Plugin = {
                name: "plugin-1",
                version: "1.0.0",
                hooks: {
                    onBeforeBuild: async (ctx) => {
                        return {
                            continue: true,
                            context: {
                                data: { ...(ctx.data || {}), step1: true },
                            },
                        };
                    },
                },
            };

            const plugin2: Plugin = {
                name: "plugin-2",
                version: "1.0.0",
                hooks: {
                    onBeforeBuild: async (ctx) => {
                        return {
                            continue: true,
                            context: {
                                data: { ...(ctx.data || {}), step2: true },
                            },
                        };
                    },
                },
            };

            manager.registerPlugin(plugin1);
            manager.registerPlugin(plugin2);

            const context: HookContext = {
                config: {} as any,
            };

            const result = await manager.executeHook("onBeforeBuild", context);

            expect(result.data).toEqual({ step1: true, step2: true });
        });

        it("应该保留原始上下文中的配置", async () => {
            const plugin: Plugin = {
                name: "context-plugin",
                version: "1.0.0",
                hooks: {
                    onBeforeBuild: async (ctx) => {
                        return {
                            continue: true,
                            context: {
                                data: { configExists: !!ctx.config },
                            },
                        };
                    },
                },
            };

            manager.registerPlugin(plugin);

            const context: HookContext = {
                config: { title: "Test" } as any,
            };

            const result = await manager.executeHook("onBeforeBuild", context);

            expect(result.data).toEqual({ configExists: true });
            expect(result.config).toEqual({ title: "Test" });
        });
    });

    describe("Hook 类型", () => {
        it("应该支持所有 Hook 类型", () => {
            const hookTypes: HookType[] = [
                "onConfigLoad",
                "onBeforeBuild",
                "onAfterBuild",
                "onBeforeRender",
                "onAfterRender",
                "onContentProcess",
                "onTemplateLoad",
            ];

            const plugin: Plugin = {
                name: "all-hooks-plugin",
                version: "1.0.0",
                hooks: {},
            };

            for (const hookType of hookTypes) {
                plugin.hooks[hookType] = async () => ({ continue: true });
            }

            manager.registerPlugin(plugin);

            expect(manager.getPlugin("all-hooks-plugin")).toBeDefined();
        });

        it("没有注册 Hook 时应该跳过执行", async () => {
            const plugin: Plugin = {
                name: "no-hooks-plugin",
                version: "1.0.0",
                hooks: {},
            };

            manager.registerPlugin(plugin);

            const context: HookContext = {
                config: {} as any,
            };

            const result = await manager.executeHook("onBeforeBuild", context);

            expect(result).toEqual(context);
        });
    });
});
