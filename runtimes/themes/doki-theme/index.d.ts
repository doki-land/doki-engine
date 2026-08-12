export interface DokiThemeClient {
  entries?: Record<string, string>
}

export interface DokiTheme {
  /** Directory of templates relative to the theme package root */
  templates: string
  assets?: string
  /** Logical layout name → template path within templates/ */
  layouts?: Record<string, string>
  configSchema?: string
  client?: DokiThemeClient
  /** Optional executable entry using the same plugin API */
  plugin?: string
}

export function defineTheme(theme: DokiTheme): DokiTheme
