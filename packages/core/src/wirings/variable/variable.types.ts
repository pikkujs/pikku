export type CoreVariable<T = unknown> = {
  /** How the variable is asked for in code. Generated into `VariablesMap`, so it is what `variables.get` autocompletes. */
  name: string
  /** The name shown to whoever configures the deployment. */
  displayName: string
  /** What the value does, for the person setting it rather than the one reading it. */
  description?: string
  /** The environment variable this reads, which is the name that has to exist on the host. */
  variableId: string
  /** The shape of the value. It arrives as a string, so this is also what parses it. */
  schema: T
  /** Required by default: this says the deployment is still correct without it. */
  optional?: boolean
  /** Where to go to work out what to set this to. */
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

/**
 * Declares an environment variable this project needs, with the shape of its
 * value. The CLI collects every declaration into `VariablesMap`, which is what
 * makes `variables.get('NAME')` return the right type instead of `unknown`.
 *
 * @example snippet: variables
 */
export const defineVariable = <T>(_config: CoreVariable<T>): void => {}
