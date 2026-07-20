export type CoreVariable<T = unknown> = {
  name: string
  displayName: string
  description?: string
  variableId: string
  schema: T
  /**
   * Link to documentation explaining how to obtain this value — a provider's
   * API-key page, a setup guide, an internal runbook. Surfaced by consoles and
   * deploy UIs so a user facing a missing value has somewhere to go instead of
   * an opaque identifier.
   */
  docsUrl?: string
  /**
   * Mark a value the app can start without. Deploy gates and config checks
   * should report it as informational rather than blocking, matching code that
   * treats a missing value as an optional feature being switched off. Defaults
   * to false — absent means required.
   */
  optional?: boolean
}

export type VariableDefinitionMeta = {
  name: string
  displayName: string
  description?: string
  variableId: string
  schema?: Record<string, unknown> | string
  /**
   * Link to documentation explaining how to obtain this value — a provider's
   * API-key page, a setup guide, an internal runbook. Surfaced by consoles and
   * deploy UIs so a user facing a missing value has somewhere to go instead of
   * an opaque identifier.
   */
  docsUrl?: string
  /**
   * Mark a value the app can start without. Deploy gates and config checks
   * should report it as informational rather than blocking, matching code that
   * treats a missing value as an optional feature being switched off. Defaults
   * to false — absent means required.
   */
  optional?: boolean
  sourceFile?: string
}

export type VariableDefinitionsMeta = Record<string, VariableDefinitionMeta>

export type VariableDefinitions = VariableDefinitionMeta[]

export const wireVariable = <T>(_config: CoreVariable<T>): void => {}
