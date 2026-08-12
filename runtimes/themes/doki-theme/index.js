/**
 * @typedef {import('./index.d.ts').DokiTheme} DokiTheme
 */

/**
 * Identity helper for theme authors. Validates a minimal declarative shape.
 * @param {DokiTheme} theme
 * @returns {DokiTheme}
 */
export function defineTheme(theme) {
  if (!theme || typeof theme !== 'object') {
    throw new TypeError('defineTheme expects a theme object')
  }
  if (!theme.templates || typeof theme.templates !== 'string') {
    throw new TypeError('defineTheme: `templates` must be a non-empty string path')
  }
  return theme
}
