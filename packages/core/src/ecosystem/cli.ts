export {
  CLIError,
  executeCLI,
  pikkuCLIRender,
  runCLICommand,
} from '../wirings/cli/cli-runner.js'
export type {
  CLICommandMeta,
  CLIMeta,
  CLIProgramMeta,
  CoreCLI,
  CoreCLICommandConfig,
  CorePikkuCLIRender,
} from '../wirings/cli/cli.types.js'
export { generateCommandHelp } from '../wirings/cli/command-parser.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type {
  CreateConfig,
  CreateSingletonServices,
  CreateWireServices,
} from '../types/core.types.js'
