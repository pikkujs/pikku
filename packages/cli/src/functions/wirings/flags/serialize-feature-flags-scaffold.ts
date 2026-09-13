/**
 * Generate the read wire a client asks for its own flags on.
 *
 * Generated into the app rather than shipped in an addon because the map is
 * keyed by the app's own `FeatureFlagName`. An addon merges its declarations
 * through the metadata sidecar but never sees the host's union, so the same
 * endpoint written there could only return `Record<string, boolean>` — losing
 * the one thing generating a union was for.
 *
 * No middleware, on the same terms as the analytics ingest: who may ask is the
 * project's call, and the answer is already per-caller.
 */
export const serializeFeatureFlagsScaffold = (
  leaf: (name: string) => string,
  globalHTTPPrefix: string = ''
): string => `/**
 * Auto-generated feature flag read wire
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc } from '${leaf('function')}'
import { wireHTTP } from '${leaf('http')}'
import {
  FEATURE_FLAGS,
  FEATURE_FLAGS_FALLBACK,
  type FeatureFlagName,
} from '${leaf('scopes')}'
import { resolveFlagsForClient } from '@pikku/core/flag'

/**
 * Every declared flag resolved for the caller, in one request.
 *
 * Asked once per session and read from memory after — a flag is checked
 * wherever a component renders, and a request each would put the network in
 * front of a paint.
 *
 * Unauthenticated by necessity: a signed-out visitor still renders a page, and
 * a flag it cannot hold resolves false rather than being withheld. The session
 * is the server's, never read from the body, so no caller can ask what someone
 * else would see.
 *
 * Booleans, not the two halves of a flag's state. \`show\` is their collapse,
 * and sending \`available\` apart from \`capable\` would tell every visitor which
 * features exist but are dark.
 */
export const featureFlagsForCaller = pikkuSessionlessFunc<
  null,
  Record<FeatureFlagName, boolean>
>({
  auth: false,
  tags: ['feature-flags'],
  description: 'Resolves every declared feature flag for the calling session.',
  func: async ({ featureFlags }, _data, { session }) => {
    // No source wired resolves against the compiled declaration, the same
    // fallback a source uses on a cold start. Availability fails open, so a
    // project that has not chosen a store yet does not have its clients start
    // hiding every flagged feature — but \`anyOf\` is still read off the
    // session, so a scoped flag is not handed to a caller who cannot hold it.
    const snapshot = featureFlags
      ? await featureFlags.snapshot()
      : FEATURE_FLAGS_FALLBACK
    return resolveFlagsForClient(
      FEATURE_FLAGS,
      session,
      snapshot
    ) as Record<FeatureFlagName, boolean>
  },
})

wireHTTP({
  route: '${globalHTTPPrefix}/feature-flags',
  method: 'get',
  auth: false,
  tags: ['feature-flags'],
  func: featureFlagsForCaller,
})
`
