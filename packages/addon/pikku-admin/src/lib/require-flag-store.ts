import type { FeatureFlagSource, FeatureFlagStore } from '@pikku/core/services'
import { asFlagStore } from './flag-store.js'

/**
 * The write half or a refusal that says which case it is.
 *
 * Two different configuration mistakes reach here and a caller cannot act on
 * either without being told them apart: no flag service at all, and a
 * read-only provider whose switches live in its own UI.
 */
export const requireFlagStore = (
  featureFlags: FeatureFlagSource | undefined
): FeatureFlagStore => {
  if (!featureFlags) {
    throw new Error(
      'No feature flag service is wired. Register a FeatureFlagStore on singleton services to switch flags from here.'
    )
  }
  const store = asFlagStore(featureFlags)
  if (!store) {
    throw new Error(
      'The wired feature flag service is read-only. A third-party provider owns its own operator surface — switch the flag there.'
    )
  }
  return store
}
