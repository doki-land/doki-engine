export type HookName =
  | 'validateConfig'
  | 'discoverContent'
  | 'transformContent'
  | 'generateContent'
  | 'contributeContext'
  | 'transformAsset'
  | 'contributeClientEntries'
  | 'contributeArtifacts'
  | 'buildComplete'

export type HookFn = (
  input: Record<string, unknown>,
) =>
  | void
  | Record<string, unknown>
  | Promise<void | Record<string, unknown>>

export type PluginHooks = Partial<Record<HookName, HookFn>>

export interface DokiPlugin {
  id: string
  hooks: PluginHooks
  /** Audit-only capability tags */
  capabilities?: string[]
}

export function definePlugin(plugin: DokiPlugin): DokiPlugin
export function isDokiPlugin(value: unknown): value is DokiPlugin
