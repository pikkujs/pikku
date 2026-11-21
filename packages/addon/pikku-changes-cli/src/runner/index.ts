export { ChangesRunner, MAX_PARALLEL, type RunnerDeps } from './runner.js'
export { shellLauncher, type ShellLauncherOptions } from './shell-launcher.js'
export { processCommands, runProcess, queue, cliJson } from './commands.js'
export {
  prepareWorktree,
  setupCheckout,
  refreshCheckout,
  mainCli,
  gitDirOf,
  hasOwnWork,
  checkCommandOf,
  type CheckoutSetup,
  type Prepared,
} from './prepare.js'
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
