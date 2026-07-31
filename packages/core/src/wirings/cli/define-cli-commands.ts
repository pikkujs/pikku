import type { CoreCLICommandConfig } from './cli.types.js'

/** Identity at runtime; exists so a commands record can be typed and composed before `wireCLI`. */
export function defineCLICommands<
  T extends Record<string, CoreCLICommandConfig<any, any, any, any>>,
>(commands: T): T {
  return commands
}
