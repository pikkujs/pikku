export type CoreVariable<T = unknown> = {
  name: string
  displayName: string
  description?: string
  variableId: string
  schema: T
  /**
   * A variable is OPTIONAL by default because `variables.get` returns
   * `T | undefined` and never throws — every caller already handles absence, so
   * a deploy gate that blocks on one contradicts the API. Mark a variable
   * `required` for the few whose absence genuinely breaks the app; only those
   * block a deploy.
   */
  required?: boolean
  docsUrl?: string
}

export type VariableDefinitionMeta = {
  name: string
  displayName: string
  description?: string
  variableId: string
  schema?: Record<string, unknown> | string
  required?: boolean
  docsUrl?: string
  sourceFile?: string
}

export type VariableDefinitionsMeta = Record<string, VariableDefinitionMeta>

export type VariableDefinitions = VariableDefinitionMeta[]

export const defineVariable = <T>(_config: CoreVariable<T>): void => {}
