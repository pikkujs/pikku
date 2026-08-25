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
  StepRecord,
  VirtualUserBudget,
  VirtualUserDisposition,
  VirtualUserFinding,
  VirtualUserRunResult,
  VirtualUserTarget,
} from './virtual-user.types.js'
export { PRODUCTION_DISPOSITION } from './virtual-user.types.js'
export {
  runVirtualUser,
  type RunVirtualUserParams,
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
export type {
  VirtualUserScheduleInput,
  VirtualUserScheduleRecord,
  VirtualUserScheduleStore,
} from './virtual-user-schedule-store.js'
export {
  DEFAULT_MAX_INTERVAL_MS,
  DEFAULT_MIN_INTERVAL_MS,
  isDue,
  nextRunAt,
  STALE_RUN_AFTER_MS,
  tickVirtualUserSchedules,
  type VirtualUserTickParams,
  type VirtualUserTickResult,
} from './virtual-user-schedule.js'
export {
  DISPOSITIONS,
  dispositionProfile,
  type DispositionProfile,
  type VirtualUserTuning,
} from './virtual-user-dispositions.js'
export {
  catalogueClassification,
  catalogueLookup,
  isReadOnly,
  reachableCatalogue,
  unreachableCatalogue,
} from './virtual-user-catalogue.js'
export {
  type AgentReachability,
  type ReachableAgent,
} from './virtual-user-agents.js'
export { IntentStack, intentsForPersona } from './virtual-user-intents.js'
export {
  deriveCatalogue,
  deriveIntents,
  type SchemaMap,
} from './virtual-user-derive.js'
export {
  personaVirtualUserTarget,
  type PersonaTargetOptions,
} from './virtual-user-target.js'
export {
  executeVirtualUserRun,
  logVirtualUserTick,
  requireVirtualUserRunStore,
  requireVirtualUserScheduleStore,
  runnablePersona,
  serializeVirtualUserRun,
  serializeVirtualUserSchedule,
  serializeVirtualUserSteps,
  signInPathFor,
  startVirtualUserRun,
  VIRTUAL_USER_VARIABLES,
  virtualUserScheduleRunInput,
  writeVirtualUserSchedule,
  type ExecuteVirtualUserRunParams,
  type ScaffoldPersonas,
  type StartedVirtualUserRun,
  type StartVirtualUserRunParams,
  type WriteVirtualUserScheduleParams,
} from './virtual-user-scaffold.js'
