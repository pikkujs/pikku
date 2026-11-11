/**
 * Generates `#pikku/contributor`: the contributor surface typed against this
 * project's own singleton services, the way `#pikku/setup` types
 * `pikkuServerLifecycle`.
 *
 * Everything but `defineContributors` is a type, and `defineContributors` is
 * core's helper re-bound under a narrower signature, so the module's only
 * runtime import is `@pikku/core/contributors`. The services type is imported
 * with `import type`, which a bundler erases: a contributor that imports this
 * leaf never pulls the project's function types, services or any other
 * `#pikku/*` module into a Worker or standalone bundle.
 *
 * An addon has no singleton services type of its own, so it is not generated
 * for one; addons author against `@pikku/core/contributors` directly.
 */
export const serializeContributorTypes = (
  singletonServicesTypeImport: string
) => {
  return `/**
 * Contributors typed against this project's own singleton services
 */

import { defineContributors as coreDefineContributors } from '@pikku/core/contributors'
import type {
  Contributor as CoreContributor,
  ContributorPlatform,
  ContributorVariants as CoreContributorVariants,
} from '@pikku/core/contributors'
${singletonServicesTypeImport}

export type {
  ContributorBindingSource,
  ContributorDb,
  ContributorPlatform,
  ContributorTarget,
} from '@pikku/core/contributors'

/**
 * A contributor whose \`services\` are this project's singleton services, so
 * \`run(services, env, runtime, platform)\` and \`onServerStart(services)\` are
 * typed rather than \`any\`.
 */
export type Contributor<
  TPlatform extends ContributorPlatform = ContributorPlatform,
> = CoreContributor<SingletonServices, TPlatform>

/** The \`dev\` and \`deploy\` variants of one named contributor. */
export type ContributorVariants<
  TPlatform extends ContributorPlatform = ContributorPlatform,
> = CoreContributorVariants<SingletonServices, TPlatform>

/**
 * Registers contributors by name, keyed by contributor name. Each \`dev\` /
 * \`deploy\` value must be a reference to an exported \`Contributor\` const, as
 * with core's helper, which this is at runtime.
 *
 * @example
 * \`\`\`typescript
 * import { defineContributors } from '#pikku/contributor'
 * import type { Contributor } from '#pikku/contributor'
 *
 * export const queueDev: Contributor = {
 *   provides: ['queueService'],
 *   run(services) {
 *     services.queueService = new InMemoryQueue()
 *   },
 * }
 *
 * export const contributors = defineContributors({ queue: { dev: queueDev } })
 * \`\`\`
 */
export const defineContributors: <
  const T extends Record<string, ContributorVariants>,
>(
  contributors: T
) => T = coreDefineContributors
`
}
