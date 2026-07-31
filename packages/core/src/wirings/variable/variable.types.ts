export type CoreVariable<T = unknown> = {
  name: string
  displayName: string
  description?: string
  variableId: string
  schema: T
  docsUrl?: string
}

export type VariableDefinitionMeta = {
  name: string
  displayName: string
  description?: string
  variableId: string
  schema?: Record<string, unknown> | string
  docsUrl?: string
  sourceFile?: string
}

export type VariableDefinitionsMeta = Record<string, VariableDefinitionMeta>

export type VariableDefinitions = VariableDefinitionMeta[]

export const defineVariable = <T>(_config: CoreVariable<T>): void => {}
