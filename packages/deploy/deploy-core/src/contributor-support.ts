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
