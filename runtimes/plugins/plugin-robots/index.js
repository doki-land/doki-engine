import { definePlugin } from "@doki-land/doki-plugin";

function pageUrl(baseUrl, id) {
    const base = (baseUrl || "").replace(/\/$/, "");
    const slug = String(id).replace(/\.mdx?$/, "");
    return base ? `${base}/pages/${slug}.html` : `/pages/${slug}.html`;
}

export default definePlugin({
    id: "@doki-land/doki-plugin-robots",
    capabilities: ["artifacts:robots"],
    hooks: {
        async contributeArtifacts(input) {
            const baseUrl = (input?.baseUrl || "").replace(/\/$/, "");
            const sitemap = baseUrl ? `${baseUrl}/sitemap.xml` : "/sitemap.xml";
            const body = [
                "User-agent: *",
                "Allow: /",
                `Sitemap: ${sitemap}`,
                "",
            ].join("\n");
            return {
                artifacts: [
                    { path: "robots.txt", contents: body, encoding: "utf8" },
                ],
            };
        },
    },
});

export { pageUrl };
