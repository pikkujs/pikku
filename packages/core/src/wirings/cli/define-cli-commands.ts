import type { CoreCLICommandConfig } from './cli.types.js'

/**
 * Type-safe helper for defining CLI commands that can be composed.
 * Returns the commands record as-is (identity function) for use with `wireCLI`.
 *
 * @example
 * ```typescript
 * export const chatCommands = defineCLICommands({
 *   chat: pikkuCLICommand({ func: chatFunc }),
 *   'chat:history': pikkuCLICommand({ func: historyFunc }),
 * })
 *
 * wireCLI({
 *   program: 'my-app',
 *   commands: { ...chatCommands, other: pikkuCLICommand({ func: otherFunc }) }
 * })
 * ```
 */
export function defineCLICommands<
  T extends Record<string, CoreCLICommandConfig<any, any, any, any>>,
>(commands: T): T {
  return commands
}
