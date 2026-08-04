/**
 * Virtual user module exports.
 *
 * A virtual user is an LLM playing a persona that signs into a *running* stage
 * and works its API in character — non-deterministically, with a budget, and
 * with oracles watching what comes back. It is not a test runner: nothing here
 * asserts an expected outcome, because the point is the outcomes nobody thought
 * to expect.
 *
 * Everything it needs is derived from what a pikku project already generates —
 * the function meta becomes the catalogue, the scenario meta becomes the
 * intents, the declared personas become the identities — so adopting it is
 * configuration rather than authoring.
 *
 * The engine is transport-agnostic: the virtual user drives an
 * {@link VirtualUserTarget}, which in production is an `HttpPersona`
 * signed in as a real user against staging or production.
 */
export type {
  ApiCatalogueEntry,
  IntentRecord,
  IntentSource,
  IntentStatus,
  StepRecord,
  VirtualUserAction,
  VirtualUserBudget,
  VirtualUserDisposition,
  VirtualUserFinding,
  VirtualUserFindingKind,
  VirtualUserRunResult,
  VirtualUserTally,
  VirtualUserTarget,
} from './virtual-user.types.js'
export { PRODUCTION_DISPOSITION } from './virtual-user.types.js'
export {
  runVirtualUser,
  rememberIds,
  type RunVirtualUserParams,
  type VirtualUserCallContext,
} from './run-virtual-user.js'
export {
  personaScopes,
  prepareVirtualUserRun,
  type VirtualUserPreparation,
} from './prepare-virtual-user-run.js'
export type {
  VirtualUserRunOutcome,
  VirtualUserRunRecord,
  VirtualUserRunStart,
  VirtualUserRunStore,
} from './virtual-user-run-store.js'
export {
  DISPOSITIONS,
  dispositionProfile,
  type DispositionProfile,
  type VirtualUserTuning,
} from './virtual-user-dispositions.js'
export {
  catalogueClassification,
  catalogueIndex,
  catalogueLookup,
  describeEntry,
  isReadOnly,
  reachableCatalogue,
  renderCatalogue,
  unreachableCatalogue,
} from './virtual-user-catalogue.js'
export {
  reachableAgents,
  type AgentReachability,
  type ReachableAgent,
} from './virtual-user-agents.js'
export {
  IntentStack,
  intentsForPersona,
  type IntentMove,
  type ScheduledTick,
} from './virtual-user-intents.js'
export { createRng, type VirtualUserRng } from './virtual-user-rng.js'
export {
  deriveCatalogue,
  deriveIntents,
  type SchemaMap,
} from './virtual-user-derive.js'
export {
  personaVirtualUserTarget,
  type PersonaTargetOptions,
} from './virtual-user-target.js'
