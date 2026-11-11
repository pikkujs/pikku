/**
 * Virtual user module exports.
 *
 * A virtual user is an LLM that signs into a *running* stage
 * and works its API in character — non-deterministically, with a budget, and
 * with oracles watching what comes back. It is not a test runner: nothing here
 * asserts an expected outcome, because the point is the outcomes nobody thought
 * to expect.
 *
 * Everything it needs is derived from what a pikku project already generates —
 * the function meta becomes the catalogue, the scenario meta becomes the
 * intents, the declared virtual users become the identities — so adopting it is
 * configuration rather than authoring.
 *
 * The engine is transport-agnostic: the virtual user drives an
 * {@link VirtualUserTarget}, which in production is an `HttpVirtualUser`
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
  virtualUserScopes,
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
export { IntentStack, intentsForVirtualUser } from './virtual-user-intents.js'
export {
  deriveCatalogue,
  deriveIntents,
  type SchemaMap,
} from './virtual-user-derive.js'
export {
  virtualUserTarget,
  type VirtualUserTargetOptions,
} from './virtual-user-target.js'
export {
  executeVirtualUserRun,
  logVirtualUserTick,
  requireVirtualUserRunStore,
  requireVirtualUserScheduleStore,
  runnableVirtualUser,
  serializeVirtualUserRun,
  serializeVirtualUserSchedule,
  serializeVirtualUserSteps,
  startVirtualUserRun,
  VIRTUAL_USER_VARIABLES,
  virtualUserScheduleRunInput,
  writeVirtualUserSchedule,
  type ExecuteVirtualUserRunParams,
  type ScaffoldVirtualUsers,
  type StartedVirtualUserRun,
  type StartVirtualUserRunParams,
  type WriteVirtualUserScheduleParams,
} from './virtual-user-scaffold.js'
export { defineVirtualUsers } from './define-virtual-users.js'
export {
  isRunnableVirtualUser,
  roleMismatchMessage,
  runnableVirtualUsers,
  validateAndBuildVirtualUsersMeta,
  verifyVirtualUserRoles,
} from './validate-virtual-users.js'
export type { RoleVerification } from './validate-virtual-users.js'
export {
  virtualUserEnvironmentErrors,
  virtualUserEnvironmentRefusal,
} from './virtual-user-environments.js'
export type {
  VirtualUserEnvironment,
  VirtualUserEnvironmentSubject,
} from './virtual-user-environments.js'
export { virtualUserEmail, virtualUserEmails } from './virtual-user-email.js'
export {
  APP_SCOPE_ROOT,
  appScopeId,
  buildAppScopeDefinition,
} from './virtual-user-app-scopes.js'
export type {
  MailboxAllowlist,
  VirtualUserMailbox,
  ReceivedEmail,
} from './virtual-user-mailbox.js'
export type {
  CoreVirtualUser,
  CoreVirtualUsers,
  VirtualUserAccountMeta,
  VirtualUserDefinitions,
  VirtualUserMeta,
  VirtualUsersMeta,
} from './virtual-user-declaration.types.js'

/**
 * Signing in as a virtual user and talking to a stage over HTTP.
 *
 * Deliberately reached through this entry point rather than `@pikku/core/services`.
 * `HttpVirtualUser` pulls in the conversation runner and, through it, the
 * agent runner — none of which a production server has any use for. Exporting it
 * from the services barrel put that chain in the module graph of every app that
 * imports services, which only a bundler could remove and an unbundled Node or
 * Lambda deploy would load outright.
 */
export {
  HttpVirtualUser,
  createHttpVirtualUsers,
  type HttpVirtualUsersConfig,
} from './http-virtual-users.js'
export {
  statementSignIn,
  inProcessSignIn,
  authMount,
  type VirtualUserSignIn,
  type VirtualUserStatementMint,
  type StatementSignInOptions,
  type InProcessAuth,
} from '../../services/virtual-user-sign-in.js'
export {
  createCookieJar,
  type ScenarioCookieJar,
} from '../../services/scenario-cookie-jar.js'
export {
  postScenarioJson,
  readScenarioHttpResponse,
} from '../../services/virtual-users-service.js'
