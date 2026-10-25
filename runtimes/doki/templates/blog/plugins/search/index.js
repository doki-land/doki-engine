function definePlugin(p) { return p }

export default definePlugin({
  id: './plugins/search',
  capabilities: ['artifacts:search'],
  hooks: {
    async contributeArtifacts(input) {
      const pages = Array.isArray(input?.contentIds) ? input.contentIds : []
      const title = input?.title || 'Site'
      const entries = pages.map((id) => {
        const slug = String(id).replace(/\.mdx?$/, '')
        return {
          id: String(id),
          title: slug,
          url: `/pages/${slug}.html`,
        }
      })
      const json = JSON.stringify(
        {
          version: 1,
          title,
          entries,
        },
        null,
        2,
      )
      return {
        artifacts: [
          { path: 'search-index.json', contents: json + '\n', encoding: 'utf8' },
        ],
      }
    },
  },
})
