export type { VariablesService } from '../services/variables-service.js'
export { validateAndBuildVariableDefinitionsMeta } from '../wirings/variable/validate-variable-definitions.js'
export type {
  CoreVariable,
  VariableDefinitionMeta,
  VariableDefinitions,
  VariableDefinitionsMeta,
} from '../wirings/variable/variable.types.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type { SchemaRefLike } from '../types/core.types.js'
