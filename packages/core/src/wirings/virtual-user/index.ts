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
 * intents, the actors become the identities — so adopting it is configuration
 * rather than authoring.
 *
 * The engine is transport-agnostic: the virtual user drives an
 * {@link VirtualUserTarget}, which in production is an `HttpScenarioActor`
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
  VirtualUserMeta,
  VirtualUsersMeta,
  VirtualUserRunResult,
  VirtualUserTally,
  VirtualUserTarget,
} from './virtual-user.types.js'
export {
  runVirtualUser,
  rememberIds,
  type RunVirtualUserParams,
  type VirtualUserCallContext,
} from './run-virtual-user.js'
export {
  DISPOSITIONS,
  dispositionProfile,
  type DispositionProfile,
} from './virtual-user-dispositions.js'
export {
  catalogueClassification,
  catalogueIndex,
  describeEntry,
  isReadOnly,
  reachableCatalogue,
  renderCatalogue,
} from './virtual-user-catalogue.js'
export {
  IntentStack,
  intentsForActor,
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
  actorVirtualUserTarget,
  type ActorTargetOptions,
} from './virtual-user-target.js'
