export {
  HarnessInfraError,
  SEVERITIES,
  type Finding,
  type InfraKind,
  type Severity,
} from '@pikku/addon-changes-cli/lib/finding.js'
export { redact } from '@pikku/addon-changes-cli/lib/redact.js'
export {
  cleanOutput,
  runCli,
  trimOutput,
  type RunCliOptions,
} from '@pikku/addon-changes-cli/lib/run-cli.js'
export {
  clearOrphan,
  clearOrphans,
  groupAlive,
  isAlive,
  processStartTime,
  readLock,
  removeLock,
  stopGroup,
  trackGroup,
  untrackGroup,
  writeLock,
} from '@pikku/addon-changes-cli/lib/process-group.js'
export {
  localChangesRPC,
  localStorePath,
} from '@pikku/addon-changes-cli/lib/changes-local.js'
export {
  DEFAULT_THRESHOLD,
  REFERENCES_DIR,
  SITE_NOTES,
  WAIVABLE_BELOW,
  embeddedScreenshots,
  readSites,
  referenceProblem,
  touchedPages,
} from '@pikku/addon-changes-cli/lib/page-reference.js'
export {
  MAX_CLONE_PAGES,
  buildsPages,
  declaredNewPages,
  declaredPages,
} from '@pikku/addon-changes-cli/lib/change-plan.js'
export {
  isDependencyFile,
  migrationFiles,
  schemaFiles,
} from '@pikku/addon-changes-cli/lib/migration-files.js'
export {
  cliJson,
  mergeConflictOf,
  pikkuCheckoutOf,
  prepareWorktree,
  processCommands,
  queue,
  refreshMain,
  runProcess,
  selfCheck,
  worktreeOf,
  writeShims,
  type CheckoutSetup,
  type LocalCli,
  type NextRoute,
  type QueueGroup,
  type RunnerCommands,
} from '@pikku/addon-changes-cli/runner'
