export { ChangesRunner, MAX_PARALLEL, type RunnerDeps } from './runner.js'
export { shellLauncher, type ShellLauncherOptions } from './shell-launcher.js'
export {
  processCommands,
  runProcess,
  queue,
  cliJson,
  mergeConflictOf,
  type Queue,
  type QueueGroup,
  type QueueChange,
} from './commands.js'
export {
  prepareWorktree,
  setupCheckout,
  refreshCheckout,
  refreshMain,
  mainCli,
  gitDirOf,
  hasOwnWork,
  worktreeOf,
  checkCommandOf,
  type CheckoutSetup,
  type MainRefresh,
  type Prepared,
} from './prepare.js'
export { DEPENDENCY_FILES } from '../lib/migration-files.js'
export { selfCheck, strayFiles, type SelfCheckInput } from './self-check.js'
export { relinkPikku, otherCli, pikkuCheckoutOf } from './relink.js'
export { writeShims } from './shims.js'
export {
  defaultPrompts,
  buildPrompt,
  repairPrompt,
  conflictPrompt,
} from './prompts.js'
export type * from './types.js'
