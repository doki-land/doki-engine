function definePlugin(p) {
    return p;
}

export default definePlugin({
    id: "./plugins/robots",
    capabilities: ["artifacts:robots"],
    hooks: {
        async contributeArtifacts(input) {
            const baseUrl = (input?.site?.baseUrl || "").replace(/\/$/, "");
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
