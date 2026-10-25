function definePlugin(p) { return p }

/**
 * Official sitemap plugin — returns a serializable artifact patch.
 * Rust core validates/applies patches; this module has no build authority.
 */
export default definePlugin({
  id: './plugins/sitemap',
  capabilities: ['artifacts:sitemap'],
  hooks: {
    async validateConfig(input) {
      if (!input?.title) {
        throw new Error('sitemap plugin: site title is required')
      }
      return { ok: true }
    },
    async contributeArtifacts(input) {
      const baseUrl = (input?.baseUrl || '').replace(/\/$/, '')
      const pages = Array.isArray(input?.contentIds) ? input.contentIds : []
      const urls = pages.map((id) => {
        const loc = baseUrl
          ? `${baseUrl}/pages/${String(id).replace(/\.mdx?$/, '')}.html`
          : `/pages/${String(id).replace(/\.mdx?$/, '')}.html`
        return `  <url><loc>${loc}</loc></url>`
      })
      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls,
        '</urlset>',
        '',
      ].join('\n')
      return {
        artifacts: [{ path: 'sitemap.xml', contents: xml, encoding: 'utf8' }],
      }
    },
  },
})
