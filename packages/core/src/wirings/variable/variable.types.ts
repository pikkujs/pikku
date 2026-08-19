export type CoreVariable<T = unknown> = {
  name: string
  displayName: string
  description?: string
  variableId: string
  schema: T
  /**
   * A variable is REQUIRED by default, and marking it `optional` is how a
   * declaration says its absence is a supported state. Same flag, same
   * polarity and same meaning as `CoreSecret.optional` — one word to learn
   * rather than two with opposite senses.
   *
   * Defaulting to required rather than following `variables.get`'s
   * `T | undefined` return is deliberate. That signature describes what a
   * caller must HANDLE, not whether a deployment is correct without the value:
   * an undefined feature flag is fine, an undefined API base URL is an outage
   * that the type system cannot tell apart. Declaring the difference is the
   * point of the flag, and the safe default for an undeclared one is to ask.
   */
  optional?: boolean
  docsUrl?: string
}

export type VariableDefinitionMeta = {
  name: string
  displayName: string
  description?: string
  variableId: string
  schema?: Record<string, unknown> | string
  optional?: boolean
  docsUrl?: string
  sourceFile?: string
}

export type VariableDefinitionsMeta = Record<string, VariableDefinitionMeta>

export type VariableDefinitions = VariableDefinitionMeta[]

export const defineVariable = <T>(_config: CoreVariable<T>): void => {}
