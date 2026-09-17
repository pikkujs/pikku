export {
  wireCLI,
  runCLICommand,
  pikkuCLIRender,
  executeCLI,
  CLIError,
} from './cli-runner.js'

export { parseCLIArguments, generateCommandHelp } from './command-parser.js'

export { defineCLICommands } from './define-cli-commands.js'

/**
 * Exported so every entrypoint that can be the last thing to catch an error —
 * the `pikku` binary, a generated bootstrap, a channel client — prints it the
 * same way, instead of each inventing its own `console.error(error.message)`.
 */
export { formatCLIError, wantsStackTrace } from './format-cli-error.js'
export type {
  CLIMeta,
  CLICommandMeta,
  CLIProgramMeta,
  CoreCLI,
  CoreCLICommandConfig,
  CorePikkuCLIRender,
} from './cli.types.js'
