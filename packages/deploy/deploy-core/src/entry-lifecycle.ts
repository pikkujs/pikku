/**
 * The generated platform-services file for a unit, which the entry imports.
 * Absent when the provider names no platform services module.
 */
export interface EntryPlatformServices {
  /**
   * Import specifier, relative to `unitDir`, of the file that exports
   * `createPlatformServices(env, runtime)`.
   */
  importPath: string
}

/** The variable generated entries import the app's server lifecycle as. */
export const appLifecycleVariable = '__pikkuLifecycle'

/**
 * The variable an entry calls `beforeStart`/`afterStart`/`beforeStop`/`afterStop`
 * on, or undefined when the app declares no lifecycle.
 */
export const entryLifecycleVariable = (ctx: {
  lifecycle?: unknown
}): string | undefined => (ctx.lifecycle ? appLifecycleVariable : undefined)
