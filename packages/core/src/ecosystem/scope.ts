export { hasScopes, verifyScopes } from '../scopes.js'
export type { ScopeService } from '../services/scope-service.js'
export { defineScope } from '../wirings/scope/define-scope.js'
export type {
  CoreScopeNode,
  CoreScopes,
  FlatScope,
  ScopeDefinitionMeta,
  ScopeDefinitions,
  ScopeDefinitionsMeta,
  ScopeNodeMeta,
} from '../wirings/scope/scope.types.js'
export {
  flattenScopeDefinitions,
  validateAndBuildScopeDefinitionsMeta,
} from '../wirings/scope/validate-scope-definitions.js'
