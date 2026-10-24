import type {
  ContributorPlatform,
  ContributorVariants,
} from './contributors.types.js'

/**
 * Registers an addon's contributors by name. A project opts in to a name with
 * `wireAddon({ contributors: ['name'] })`; only the selected variant for the
 * build target is bundled.
 */
export const defineContributors = <
  const T extends Record<string, ContributorVariants<any, ContributorPlatform>>,
>(
  contributors: T
): T => contributors
