/**
 * Opts this project in to contributors a plain package registers with
 * `defineContributors`, without wiring an addon. Read statically by the
 * inspector at build time, so it does nothing when the app runs.
 *
 * @example snippet: wireContributors
 */
export const wireContributors = (config: {
  /** The package that registers the contributors. */
  package: string
  /** Contributor names to take, as the package registered them. */
  contributors: string[]
}): void => {}
