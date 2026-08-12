/**
 * Doki Engine 示例插件
 *
 * 演示插件的基本结构和 Hook 使用方式
 */

export default {
    name: "example-plugin",
    version: "0.1.0",
    description: "示例插件",

    hooks: {
        /**
         * 配置加载后触发
         * @param {import('doki-engine').HookContext} context - Hook 上下文
         * @returns {import('doki-engine').HookResult} Hook 结果
         */
        onConfigLoad: async (context) => {
            console.log("[example-plugin] 配置已加载");
            console.log(
                "[example-plugin] 站点标题:",
                context.config.site?.title,
            );
            return { continue: true };
        },

        /**
         * 构建开始前触发
         * @param {import('doki-engine').HookContext} context - Hook 上下文
         * @returns {import('doki-engine').HookResult} Hook 结果
         */
        onBeforeBuild: async (context) => {
            console.log("[example-plugin] 构建开始...");
            const startTime = Date.now();
            return {
                continue: true,
                context: {
                    data: { startTime },
                },
            };
        },

        /**
         * 构建完成后触发
         * @param {import('doki-engine').HookContext} context - Hook 上下文
         * @returns {import('doki-engine').HookResult} Hook 结果
         */
        onAfterBuild: async (context) => {
            const startTime = context.data?.startTime || Date.now();
            const duration = Date.now() - startTime;
            console.log(`[example-plugin] 构建完成，耗时 ${duration}ms`);

            if (context.buildResult) {
                console.log(
                    `[example-plugin] 生成文件数: ${context.buildResult.files?.length || 0}`,
                );
            }

            return { continue: true };
        },

        /**
         * 内容处理时触发
         * @param {import('doki-engine').HookContext} context - Hook 上下文
         * @returns {import('doki-engine').HookResult} Hook 结果
         */
        onContentProcess: async (context) => {
            if (context.currentContent) {
                const content = context.currentContent;
                console.log(`[example-plugin] 处理内容: ${content.slug}`);
            }
            return { continue: true };
        },

        /**
         * 模板加载后触发
         * @param {import('doki-engine').HookContext} context - Hook 上下文
         * @returns {import('doki-engine').HookResult} Hook 结果
         */
        onTemplateLoad: async (context) => {
            if (context.templates) {
                console.log(
                    `[example-plugin] 已加载 ${context.templates.size} 个模板`,
                );
            }
            return { continue: true };
        },

        /**
         * 渲染开始前触发
         * @param {import('doki-engine').HookContext} context - Hook 上下文
         * @returns {import('doki-engine').HookResult} Hook 结果
         */
        onBeforeRender: async (context) => {
            return { continue: true };
        },

        /**
         * 渲染完成后触发
         * @param {import('doki-engine').HookContext} context - Hook 上下文
         * @returns {import('doki-engine').HookResult} Hook 结果
         */
        onAfterRender: async (context) => {
            return { continue: true };
        },
    },

    config: {
        debug: false,
        logLevel: "info",
    },
};
