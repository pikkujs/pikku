import type {
  Contributor,
  ContributorBindingSource,
  ContributorPlatform,
} from '@pikku/core/contributors'
import type { DeploymentUnit } from './manifest.js'

/**
 * `ContributorPlatform` widened with the one fact only a deploy has: the unit
 * being generated. A contributor that wants it declares
 * `Contributor<Services, DeployContributorPlatform>`; generic contributors,
 * which also run under `pikku dev`, never see it.
 */
export type DeployContributorPlatform = ContributorPlatform & {
  unit: Pick<
    DeploymentUnit,
    'name' | 'role' | 'target' | 'dependsOn' | 'dispatch'
  >
}

/** Adds the unit to the platform; what every deploy adapter widens with. */
export const withDeployUnit = (
  platform: ContributorPlatform,
  unit: DeploymentUnit
): DeployContributorPlatform => ({
  ...platform,
  unit: {
    name: unit.name,
    role: unit.role,
    target: unit.target,
    dependsOn: unit.dependsOn,
    ...(unit.dispatch ? { dispatch: unit.dispatch } : {}),
  },
})

/**
 * A contributor the adapter itself selects, beside the ones the project opted
 * in to (a decorator the platform owns, such as column coercion).
 */
export interface FrameworkContributor {
  name: string
  contributor: Contributor<any, any>
  /** Absolute path of the module that exports it; the generated file imports it. */
  module: string
  /** The export name in `module`. */
  export: string
  /**
   * Left out, rather than failing the build, when nothing provides a service
   * it `needs`.
   */
  optional?: boolean
}

/** What a provider tells contributor resolution about one unit's target. */
export interface ContributorSupport {
  /** The binding sources the unit's runtime can supply. */
  supported: readonly ContributorBindingSource[]
  /**
   * Services the generated entry holds before any contributor runs. They are
   * handed to `run` as `runtime`, meet a contributor's `needs`, and may be
   * replaced by a contributor providing the same key.
   */
  runtimeServices: readonly string[]
  /**
   * Whether the unit's entry runs the server lifecycle, and so calls a
   * contributor's `onServerStart` / `onServerStop` (a server or container
   * entry does; a Worker or Lambda handler does not). A selected contributor
   * with `onServerStart` is a build error where this is false; `onServerStop`
   * only warns. Required, so a new provider has to decide.
   */
  runsServerLifecycle: boolean
  /** Widens the platform before resolution; `withDeployUnit` is the usual one. */
  widenPlatform?(platform: ContributorPlatform): ContributorPlatform
  /** Contributors this provider selects itself, in addition to the opted-in ones. */
  framework?: readonly FrameworkContributor[]
}

/**
 * The generated platform-services file for a unit, which the entry imports.
 * Absent when no contributor was selected for the unit.
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
 * no contributor was selected. With a platform-services file the lifecycle is
 * the composed one, so contributor hooks bracket the app's; without, it is the
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
          `import { serverStartHooks as __pikkuStartHooks, serverStopHooks as __pikkuStopHooks } from '${ctx.platformServices.importPath}'`,
        ],
        declaration: [
          `const ${composedLifecycleVariable} = composeServerLifecycle(${ctx.lifecycle ? appLifecycleVariable : 'undefined'}, { start: __pikkuStartHooks, stop: __pikkuStopHooks })`,
        ],
      }
    : { imports: [], declaration: [] }
