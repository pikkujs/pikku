export type CoreVariable<T = unknown> = {
  name: string
  displayName: string
  description?: string
  variableId: string
  schema: T
}

export type VariableDefinitionMeta = {
  name: string
  displayName: string
  description?: string
  variableId: string
  schema?: Record<string, unknown> | string
  sourceFile?: string
}

export type VariableDefinitionsMeta = Record<string, VariableDefinitionMeta>

export type VariableDefinitions = VariableDefinitionMeta[]

export const wireVariable = <T>(_config: CoreVariable<T>): void => {}
