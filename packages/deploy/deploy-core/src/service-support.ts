import type { ProviderProfile } from '@pikku/core/provider'

/** What a provider tells service resolution about one unit's target. */
export interface ServiceSupport {
  /**
   * The keys the generated entry holds before any service runs. They are handed
   * to the runner as `runtime`, meet a service's needs, and may be replaced by
   * one service providing the same key.
   */
  baseline: readonly string[]
  /**
   * The deploy runtime, which picks a provider's `deploy:<profile>` variant
   * over its plain `deploy` one.
   */
  profile: ProviderProfile
  /**
   * The keys the generated entry opens itself and builds the rest of its
   * baseline on (the standalone entry's `kysely`). No provider may replace
   * one, or the entry and the provider would each own a copy.
   */
  entryOwned: readonly string[]
  /**
   * Whether the unit's entry runs the server lifecycle, and so calls a
   * service's `onServerStart` (a server or container entry does; a Worker or
   * Lambda handler does not). A selected service with `onServerStart` is a
   * build error where this is false. Required, so a new provider has to decide.
   */
  runsServerLifecycle: boolean
}

/**
 * The generated platform-services file for a unit, which the entry imports.
 * Absent when no service was selected for the unit.
 */
export interface EntryPlatformServices {
  /**
   * Import specifier, relative to `unitDir`, of the file that exports
   * `createPlatformServices(env, runtime)`.
   */
  importPath: string
}

/** The variable generated entries call the (possibly composed) server lifecycle on. */
export const appLifecycleVariable = '__pikkuLifecycle'
export const composedLifecycleVariable = '__pikkuServerLifecycle'

/**
 * The variable an entry calls `beforeStart`/`afterStart`/`beforeStop`/`afterStop`
 * on, or undefined when it has no lifecycle to run: the app declares none and
 * no service was selected. With a platform-services file the lifecycle is
 * the composed one, so service start hooks run before the app's; without, it is the
 * app's own and the entry reads exactly as it always did.
 */
export const entryLifecycleVariable = (
  ctx: Pick<EntryGenerationContextLike, 'lifecycle' | 'platformServices'>
): string | undefined =>
  ctx.platformServices
    ? composedLifecycleVariable
    : ctx.lifecycle
      ? appLifecycleVariable
      : undefined

type EntryGenerationContextLike = {
  lifecycle?: unknown
  platformServices?: EntryPlatformServices
}

/**
 * The import and declaration lines that build the composed lifecycle from the
 * generated file's hook lists and the app's lifecycle (imported as
 * `__pikkuLifecycle` by the entry). Empty without a platform-services file.
 */
export const composedLifecycleLines = (
  ctx: EntryGenerationContextLike
): { imports: string[]; declaration: string[] } =>
  ctx.platformServices
    ? {
        imports: [
          `import { composeServerLifecycle } from '@pikku/core/lifecycle'`,
          `import { serverStartHooks as __pikkuStartHooks } from '${ctx.platformServices.importPath}'`,
        ],
        declaration: [
          `const ${composedLifecycleVariable} = composeServerLifecycle(${ctx.lifecycle ? appLifecycleVariable : 'undefined'}, { start: __pikkuStartHooks })`,
        ],
      }
    : { imports: [], declaration: [] }
