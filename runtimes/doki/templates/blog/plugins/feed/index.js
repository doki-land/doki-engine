function definePlugin(p) { return p }

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pageUrl(baseUrl, id) {
  const base = (baseUrl || '').replace(/\/$/, '')
  const slug = String(id).replace(/\.mdx?$/, '')
  return base ? `${base}/pages/${slug}.html` : `/pages/${slug}.html`
}

export default definePlugin({
  id: './plugins/feed',
  capabilities: ['artifacts:feed'],
  hooks: {
    async contributeArtifacts(input) {
      const title = input?.title || 'Site'
      const baseUrl = (input?.baseUrl || '').replace(/\/$/, '')
      const pages = Array.isArray(input?.contentIds) ? input.contentIds : []
      const updated = new Date().toISOString()
      const entries = pages
        .slice(0, 20)
        .map((id) => {
          const link = pageUrl(baseUrl, id)
          const name = String(id).replace(/\.mdx?$/, '')
          return [
            '  <entry>',
            `    <title>${escapeXml(name)}</title>`,
            `    <link href="${escapeXml(link)}"/>`,
            `    <id>${escapeXml(link)}</id>`,
            `    <updated>${updated}</updated>`,
            '  </entry>',
          ].join('\n')
        })
        .join('\n')
      const atom = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<feed xmlns="http://www.w3.org/2005/Atom">',
        `  <title>${escapeXml(title)}</title>`,
        baseUrl ? `  <link href="${escapeXml(baseUrl)}/"/>` : '',
        `  <updated>${updated}</updated>`,
        `  <id>${escapeXml(baseUrl || 'urn:doki:feed')}</id>`,
        entries,
        '</feed>',
        '',
      ]
        .filter(Boolean)
        .join('\n')
      return {
        artifacts: [{ path: 'atom.xml', contents: atom, encoding: 'utf8' }],
      }
    },
  },
})
