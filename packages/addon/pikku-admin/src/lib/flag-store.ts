import type { FeatureFlagSource, FeatureFlagStore } from '@pikku/core/services'

/**
 * Narrows the wired flag service to the half that can write.
 *
 * A `FeatureFlagSource` is read-only on purpose: PostHog and Unleash own their
 * own operator UI, and writing back through their management API would give two
 * systems the same rows. So the console's Flags tab is read-only against a
 * provider, and these functions have to say why rather than throwing whatever a
 * missing method throws.
 *
 * Detected by shape rather than by a flag on the service, because the two
 * interfaces are structural and an implementation is free to be either without
 * announcing it.
 */
export const asFlagStore = (
  featureFlags: FeatureFlagSource | undefined
): FeatureFlagStore | undefined =>
  featureFlags &&
  typeof (featureFlags as FeatureFlagStore).setEnabled === 'function'
    ? (featureFlags as FeatureFlagStore)
    : undefined
