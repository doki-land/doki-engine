/**
 * Doki Engine SEO 生成器模块
 *
 * 提供 Sitemap、robots.txt、RSS/Atom Feed 和 Open Graph 标签生成功能。
 */

/**
 * 站点地图条目
 *
 * 表示站点地图中的单个页面条目。
 */
export interface SitemapEntry {
    /** 页面 URL（相对或绝对路径） */
    loc: string;
    /** 最后修改时间（ISO 8601 格式） */
    lastmod?: string;
    /** 更新频率（always、hourly、daily、weekly、monthly、yearly、never） */
    changefreq?: string;
    /** 优先级（0.0 到 1.0） */
    priority?: number;
}

/**
 * 订阅源条目
 *
 * 表示 RSS/Atom Feed 中的单个内容条目。
 */
export interface FeedEntry {
    /** 标题 */
    title: string;
    /** 链接 */
    link: string;
    /** 描述 */
    description?: string;
    /** 发布日期（ISO 8601 格式） */
    pubDate: string;
    /** 作者 */
    author?: string;
    /** 内容（HTML 格式） */
    content?: string;
}

/**
 * 站点变量
 *
 * 包含站点的基本配置信息，用于生成 SEO 相关内容。
 */
export interface SiteVariables {
    /** 站点标题 */
    title: string;
    /** 站点描述 */
    description: string;
    /** 站点 URL */
    url: string;
    /** 站点作者 */
    author: string;
    /** 站点语言 */
    lang?: string;
}

/**
 * 页面变量
 *
 * 包含单个页面的元数据信息，用于生成 Open Graph 标签。
 */
export interface PageVariables {
    /** 页面标题 */
    title: string;
    /** 页面描述 */
    description?: string;
    /** 页面 URL */
    url: string;
    /** 页面类型（article、website 等） */
    type?: string;
    /** 特色图片 URL */
    image?: string;
    /** 发布日期 */
    date?: string;
    /** 作者 */
    author?: string;
}

/**
 * 生成站点地图 XML
 *
 * 根据提供的条目列表生成符合 Sitemap 0.9 协议的 XML 站点地图。
 *
 * @param entries 站点地图条目数组
 * @param siteUrl 站点基础 URL
 * @returns 站点地图 XML 字符串
 */
export function generateSitemap(
    entries: SitemapEntry[],
    siteUrl: string,
): string {
    const escapeXml = (str: string): string => {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    };

    const formatUrl = (loc: string): string => {
        if (loc.startsWith("http://") || loc.startsWith("https://")) {
            return loc;
        }
        const baseUrl = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
        const path = loc.startsWith("/") ? loc : `/${loc}`;
        return `${baseUrl}${path}`;
    };

    const urlElements = entries
        .map((entry) => {
            let urlElement = "  <url>\n";
            urlElement += `    <loc>${escapeXml(formatUrl(entry.loc))}</loc>\n`;

            if (entry.lastmod) {
                urlElement += `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>\n`;
            }

            if (entry.changefreq) {
                urlElement += `    <changefreq>${escapeXml(entry.changefreq)}</changefreq>\n`;
            }

            if (entry.priority !== undefined) {
                const priority = Math.max(0, Math.min(1, entry.priority));
                urlElement += `    <priority>${priority.toFixed(1)}</priority>\n`;
            }

            urlElement += "  </url>";
            return urlElement;
        })
        .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlElements}
</urlset>`;
}

/**
 * 生成 robots.txt 内容
 *
 * 生成包含站点地图引用的 robots.txt 文件内容。
 *
 * @param siteUrl 站点基础 URL
 * @returns robots.txt 内容字符串
 */
export function generateRobotsTxt(siteUrl: string): string {
    const baseUrl = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
    return `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml`;
}

/**
 * 生成 Atom 1.0 格式的订阅源
 *
 * 根据提供的条目列表和站点配置生成 Atom 1.0 格式的 XML 订阅源。
 *
 * @param entries 订阅源条目数组
 * @param siteConfig 站点配置变量
 * @returns Atom 1.0 XML 字符串
 */
export function generateAtomFeed(
    entries: FeedEntry[],
    siteConfig: SiteVariables,
): string {
    const escapeXml = (str: string): string => {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    };

    const formatUrl = (path: string): string => {
        if (path.startsWith("http://") || path.startsWith("https://")) {
            return path;
        }
        const baseUrl = siteConfig.url.endsWith("/")
            ? siteConfig.url.slice(0, -1)
            : siteConfig.url;
        const urlPath = path.startsWith("/") ? path : `/${path}`;
        return `${baseUrl}${urlPath}`;
    };

    const now = new Date().toISOString();
    const baseUrl = siteConfig.url.endsWith("/")
        ? siteConfig.url.slice(0, -1)
        : siteConfig.url;

    const entryElements = entries
        .map((entry) => {
            const entryUrl = formatUrl(entry.link);
            const pubDate = new Date(entry.pubDate).toISOString();

            let element = "  <entry>\n";
            element += `    <title>${escapeXml(entry.title)}</title>\n`;
            element += `    <link href="${escapeXml(entryUrl)}"/>\n`;
            element += `    <id>${escapeXml(entryUrl)}</id>\n`;
            element += `    <updated>${pubDate}</updated>\n`;
            element += `    <published>${pubDate}</published>\n`;

            if (entry.author || siteConfig.author) {
                element += "    <author>\n";
                element += `      <name>${escapeXml(entry.author || siteConfig.author)}</name>\n`;
                element += "    </author>\n";
            }

            if (entry.description) {
                element += `    <summary>${escapeXml(entry.description)}</summary>\n`;
            }

            if (entry.content) {
                element += `    <content type="html">${escapeXml(entry.content)}</content>\n`;
            }

            element += "  </entry>";
            return element;
        })
        .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(siteConfig.title)}</title>
  <subtitle>${escapeXml(siteConfig.description)}</subtitle>
  <link href="${escapeXml(baseUrl)}/"/>
  <link href="${escapeXml(baseUrl)}/atom.xml" rel="self"/>
  <id>${escapeXml(baseUrl)}/</id>
  <updated>${now}</updated>
  <author>
    <name>${escapeXml(siteConfig.author)}</name>
  </author>
${entryElements}
</feed>`;
}

/**
 * 生成 RSS 2.0 格式的订阅源
 *
 * 根据提供的条目列表和站点配置生成 RSS 2.0 格式的 XML 订阅源。
 *
 * @param entries 订阅源条目数组
 * @param siteConfig 站点配置变量
 * @returns RSS 2.0 XML 字符串
 */
export function generateRssFeed(
    entries: FeedEntry[],
    siteConfig: SiteVariables,
): string {
    const escapeXml = (str: string): string => {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    };

    const formatUrl = (path: string): string => {
        if (path.startsWith("http://") || path.startsWith("https://")) {
            return path;
        }
        const baseUrl = siteConfig.url.endsWith("/")
            ? siteConfig.url.slice(0, -1)
            : siteConfig.url;
        const urlPath = path.startsWith("/") ? path : `/${path}`;
        return `${baseUrl}${urlPath}`;
    };

    const now = new Date().toUTCString();
    const baseUrl = siteConfig.url.endsWith("/")
        ? siteConfig.url.slice(0, -1)
        : siteConfig.url;

    const itemElements = entries
        .map((entry) => {
            const entryUrl = formatUrl(entry.link);
            const pubDate = new Date(entry.pubDate).toUTCString();

            let element = "    <item>\n";
            element += `      <title>${escapeXml(entry.title)}</title>\n`;
            element += `      <link>${escapeXml(entryUrl)}</link>\n`;
            element += `      <guid>${escapeXml(entryUrl)}</guid>\n`;
            element += `      <pubDate>${pubDate}</pubDate>\n`;

            if (entry.author || siteConfig.author) {
                element += `      <author>${escapeXml(entry.author || siteConfig.author)}</author>\n`;
            }

            if (entry.description) {
                element += `      <description>${escapeXml(entry.description)}</description>\n`;
            }

            if (entry.content) {
                element += `      <content:encoded><![CDATA[${entry.content}]]></content:encoded>\n`;
            }

            element += "    </item>";
            return element;
        })
        .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(siteConfig.title)}</title>
    <description>${escapeXml(siteConfig.description)}</description>
    <link>${escapeXml(baseUrl)}/</link>
    <language>${escapeXml(siteConfig.lang || "zh-CN")}</language>
    <lastBuildDate>${now}</lastBuildDate>
    <generator>Doki Engine</generator>
${itemElements}
  </channel>
</rss>`;
}

/**
 * 生成 Open Graph meta 标签
 *
 * 根据页面变量生成 Open Graph 协议的 meta 标签字符串。
 *
 * @param page 页面变量
 * @returns Open Graph meta 标签字符串
 */
export function generateOgTags(page: PageVariables): string {
    const escapeHtml = (str: string): string => {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    };

    const tags: string[] = [];

    tags.push(`<meta property="og:title" content="${escapeHtml(page.title)}">`);

    if (page.description) {
        tags.push(
            `<meta property="og:description" content="${escapeHtml(page.description)}">`,
        );
    }

    if (page.url) {
        tags.push(`<meta property="og:url" content="${escapeHtml(page.url)}">`);
    }

    tags.push(
        `<meta property="og:type" content="${escapeHtml(page.type || "website")}">`,
    );

    if (page.image) {
        tags.push(
            `<meta property="og:image" content="${escapeHtml(page.image)}">`,
        );
    }

    if (page.date) {
        tags.push(
            `<meta property="article:published_time" content="${escapeHtml(page.date)}">`,
        );
    }

    if (page.author) {
        tags.push(
            `<meta property="article:author" content="${escapeHtml(page.author)}">`,
        );
    }

    return tags.join("\n");
}

/**
 * 生成规范链接 URL
 *
 * 根据站点 URL 和页面路径生成完整的 canonical URL。
 *
 * @param siteUrl 站点基础 URL
 * @param pageUrl 页面相对路径
 * @returns 完整的 canonical URL
 */
export function generateCanonicalUrl(siteUrl: string, pageUrl: string): string {
    const baseUrl = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;

    if (pageUrl.startsWith("http://") || pageUrl.startsWith("https://")) {
        return pageUrl;
    }

    const normalizedPath = pageUrl.startsWith("/") ? pageUrl : `/${pageUrl}`;

    return `${baseUrl}${normalizedPath}`;
}
