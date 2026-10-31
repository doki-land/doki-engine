import { definePlugin } from "@doki-land/doki-plugin";

/**
 * Official sitemap plugin — returns a serializable artifact patch.
 * Rust core validates/applies patches; this module has no build authority.
 */
export default definePlugin({
    id: "@doki-land/doki-plugin-sitemap",
    capabilities: ["artifacts:sitemap"],
    hooks: {
        async validateConfig(input) {
            if (!input?.title) {
                throw new Error("sitemap plugin: site title is required");
            }
            return { ok: true };
        },
        async contributeArtifacts(input) {
            const site = input?.site || {};
            const baseUrl = (site.baseUrl || "").replace(/\/$/, "");
            const pages = Array.isArray(input?.pages) ? input.pages : [];
            const urls = pages
                .filter((page) => !page.draft)
                .map((page) => `  <url><loc>${baseUrl}${page.url}</loc></url>`);
            const xml = [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
                ...urls,
                "</urlset>",
                "",
            ].join("\n");
            return {
                artifacts: [
                    { path: "sitemap.xml", contents: xml, encoding: "utf8" },
                ],
            };
        },
    },
});
