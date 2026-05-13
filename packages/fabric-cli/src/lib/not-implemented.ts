/**
 * Stub helper for CLI commands that are scaffolded but not yet wired to
 * fabric-api RPCs. Each T1 task replaces these with real implementations.
 */
export function notImplemented(commandName: string): never {
  console.error(
    `[fabric] \`${commandName}\` is not implemented yet — see GitHub epic #110.`
  )
  process.exit(2)
}
