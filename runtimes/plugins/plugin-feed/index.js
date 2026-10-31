import { definePlugin } from "@doki-land/doki-plugin";

function escapeXml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export default definePlugin({
    id: "@doki-land/doki-plugin-feed",
    capabilities: ["artifacts:feed"],
    hooks: {
        async contributeArtifacts(input) {
            const site = input?.site || {};
            const title = site.title || "Site";
            const baseUrl = (site.baseUrl || "").replace(/\/$/, "");
            const pages = Array.isArray(input?.pages) ? input.pages : [];
            const updated = new Date().toISOString();
            const posts = pages
                .filter((page) => page.type === "post")
                .sort((a, b) => {
                    const left = String(a.date || "");
                    const right = String(b.date || "");
                    if (left === right) return 0;
                    return left < right ? 1 : -1;
                })
                .slice(0, 20);
            const entries = posts
                .map((page) => {
                    const link = `${baseUrl}${page.url}`;
                    const name = page.title || page.route;
                    return [
                        "  <entry>",
                        `    <title>${escapeXml(name)}</title>`,
                        `    <link href="${escapeXml(link)}"/>`,
                        `    <id>${escapeXml(link)}</id>`,
                        `    <updated>${updated}</updated>`,
                        "  </entry>",
                    ].join("\n");
                })
                .join("\n");
            const atom = [
                '<?xml version="1.0" encoding="utf-8"?>',
                '<feed xmlns="http://www.w3.org/2005/Atom">',
                `  <title>${escapeXml(title)}</title>`,
                baseUrl ? `  <link href="${escapeXml(baseUrl)}/"/>` : "",
                `  <updated>${updated}</updated>`,
                `  <id>${escapeXml(baseUrl || "urn:doki:feed")}</id>`,
                entries,
                "</feed>",
                "",
            ]
                .filter(Boolean)
                .join("\n");
            return {
                artifacts: [
                    { path: "atom.xml", contents: atom, encoding: "utf8" },
                ],
            };
        },
    },
});
