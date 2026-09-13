import type {
  AnalyticsIdentity,
  AnalyticsIdentityResolver,
} from './analytics.types.js'

type Resolved = Pick<AnalyticsIdentity, 'vendorIds' | 'consent'>

/**
 * Runs resolvers in order, each seeing what the ones before it produced.
 *
 * Order is meaningful rather than incidental: a resolver that mints a cookie
 * may only do so once consent has been read, so the resolver reading consent
 * has to come first. Put the other way round, the minter sees no consent, mints
 * nothing, and the app collects nothing — silently, which is why this threads
 * state through instead of merging independent results.
 *
 * A later resolver wins a key it sets, so a minter's freshly created id
 * replaces the absent one the cookie reader could not find.
 */
export const composeAnalyticsIdentity = (
  ...resolvers: AnalyticsIdentityResolver[]
): AnalyticsIdentityResolver => {
  return (wire, initial) => {
    let resolved: Resolved = initial ?? {}

    for (const resolver of resolvers) {
      const next = resolver(wire, resolved)
      if (!next) continue
      resolved = {
        ...resolved,
        ...next,
        ...(next.vendorIds === undefined && resolved.vendorIds === undefined
          ? {}
          : { vendorIds: { ...resolved.vendorIds, ...next.vendorIds } }),
        ...(next.consent === undefined && resolved.consent === undefined
          ? {}
          : { consent: { ...resolved.consent, ...next.consent } }),
      }
    }

    return Object.keys(resolved).length === 0 ? undefined : resolved
  }
}
