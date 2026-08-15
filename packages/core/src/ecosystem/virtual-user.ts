export {
  personaScopes,
  prepareVirtualUserRun,
} from '../wirings/virtual-user/prepare-virtual-user-run.js'
export { runVirtualUser } from '../wirings/virtual-user/run-virtual-user.js'
export {
  catalogueClassification,
  isReadOnly,
  reachableCatalogue,
  unreachableCatalogue,
} from '../wirings/virtual-user/virtual-user-catalogue.js'
export {
  deriveCatalogue,
  deriveIntents,
} from '../wirings/virtual-user/virtual-user-derive.js'
export {
  DISPOSITIONS,
  dispositionProfile,
} from '../wirings/virtual-user/virtual-user-dispositions.js'
export type { DispositionProfile } from '../wirings/virtual-user/virtual-user-dispositions.js'
export { intentsForPersona } from '../wirings/virtual-user/virtual-user-intents.js'
export type {
  VirtualUserRunOutcome,
  VirtualUserRunRecord,
  VirtualUserRunStart,
  VirtualUserRunStore,
} from '../wirings/virtual-user/virtual-user-run-store.js'
export { personaVirtualUserTarget } from '../wirings/virtual-user/virtual-user-target.js'
export { PRODUCTION_DISPOSITION } from '../wirings/virtual-user/virtual-user.types.js'
export type {
  IntentSource,
  VirtualUserFinding,
  VirtualUserRunResult,
} from '../wirings/virtual-user/virtual-user.types.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type { FunctionsMeta } from '../types/core.types.js'
export type {
  SystemRoleDefinitions,
  SystemRoleDefinitionsMeta,
} from '../wirings/role/role.types.js'
export type { VirtualUserPreparation } from '../wirings/virtual-user/prepare-virtual-user-run.js'
export type { AgentReachability } from '../wirings/virtual-user/virtual-user-agents.js'
export type { SchemaMap } from '../wirings/virtual-user/virtual-user-derive.js'
export type { VirtualUserTuning } from '../wirings/virtual-user/virtual-user-dispositions.js'
export type {
  ApiCatalogueEntry,
  VirtualUserDisposition,
} from '../wirings/virtual-user/virtual-user.types.js'
export type { WorkflowsMeta } from '../wirings/workflow/workflow.types.js'
