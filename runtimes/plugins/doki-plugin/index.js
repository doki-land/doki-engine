/**
 * @typedef {import('./index.d.ts').DokiPlugin} DokiPlugin
 * @typedef {import('./index.d.ts').PluginHooks} PluginHooks
 */

/**
 * Identity helper for plugin authors. Validates a minimal shape; does not run builds.
 * @param {DokiPlugin} plugin
 * @returns {DokiPlugin}
 */
export function definePlugin(plugin) {
  if (!plugin || typeof plugin !== 'object') {
    throw new TypeError('definePlugin expects a plugin object')
  }
  if (!plugin.id || typeof plugin.id !== 'string') {
    throw new TypeError('definePlugin: `id` must be a non-empty string')
  }
  if (!plugin.hooks || typeof plugin.hooks !== 'object') {
    throw new TypeError('definePlugin: `hooks` must be an object')
  }
  return plugin
}

/**
 * @param {unknown} value
 * @returns {value is DokiPlugin}
 */
export function isDokiPlugin(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof /** @type {DokiPlugin} */ (value).id === 'string' &&
      /** @type {DokiPlugin} */ (value).hooks &&
      typeof /** @type {DokiPlugin} */ (value).hooks === 'object',
  )
}
