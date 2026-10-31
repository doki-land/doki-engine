function definePlugin(p) {
    return p;
}

export default definePlugin({
    id: "./plugins/search",
    capabilities: ["artifacts:search"],
    hooks: {
        async contributeArtifacts(input) {
            const site = input?.site || {};
            const baseUrl = (site.baseUrl || "").replace(/\/$/, "");
            const title = site.title || "Site";
            const pages = Array.isArray(input?.pages) ? input.pages : [];
            const entries = pages
                .filter((page) => page.type === "post")
                .map((page) => ({
                    id: page.id,
                    title: page.title || page.route,
                    url: `${baseUrl}${page.url}`,
                }));
            const json = JSON.stringify(
                {
                    version: 1,
                    title,
                    entries,
                },
                null,
                2,
            );
            return {
                artifacts: [
                    {
                        path: "search-index.json",
                        contents: `${json}\n`,
                        encoding: "utf8",
                    },
                ],
            };
        },
    },
});
