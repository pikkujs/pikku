import { pikkuState } from '../pikku-state.js'

/** One thing to stop: a service key, or one item of a collection. */
export type ProviderStopEntry =
  string | { readonly collection: string; readonly label: string }

/**
 * Records what `stopSingletonServices` stops first, in order, as the provider
 * runner computed it. Kept in core's state rather than on the services object,
 * which a services factory copies and tests compare.
 */
export const recordStopOrder = (
  stopOrder: readonly ProviderStopEntry[]
): void => {
  pikkuState(null, 'package', 'providerStopOrder', [...stopOrder])
}

export const readStopOrder = (): readonly ProviderStopEntry[] =>
  pikkuState(null, 'package', 'providerStopOrder') ?? []
