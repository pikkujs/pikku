import type { CoreUserSession } from '../../types/core.types.js'
import type { FeatureFlagSource } from '../../services/feature-flag-service.js'
import { FeatureUnavailableError } from '../../errors/errors.js'
import { resolveFlag } from './resolve-flag.js'
import type { FlagSubject } from './flag.types.js'

/**
 * The runner's half of a `featureFlag:` declaration.
 *
 * Availability only. Enforcing the capability half here would make a flag a
 * second authorization path that ORs against `scopes:`, and the two would
 * disagree the first time someone widened a flag's `anyOf` to preview it.
 *
 * No source registered is a no-op rather than a closed door: a project that has
 * not wired one yet should not discover it by having every flagged function
 * start throwing.
 */
export const assertFeatureAvailable = async (
  key: string,
  featureFlags: FeatureFlagSource | undefined,
  session: CoreUserSession | undefined,
  subject?: FlagSubject
): Promise<void> => {
  if (!featureFlags) {
    return
  }
  const config = await featureFlags.snapshot()
  const { available } = resolveFlag(key, undefined, session, config, subject)
  if (!available) {
    throw new FeatureUnavailableError(key)
  }
}
