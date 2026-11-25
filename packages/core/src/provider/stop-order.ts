import { pikkuState } from '../pikku-state.js'

/** One thing to stop: a service key, or one item of a collection. */
export type ProviderStopEntry =
  string | { readonly collection: string; readonly label: string }

/**
 * Records what `stopSingletonServices` stops first, in order, as the provider
 * runner computed it. Kept in core's state rather than on the services object,
 * which a services factory copies and tests compare.
 * `heldKeys` is every key the runner's services held when it returned: a
 * service the project's factory builds afterwards is built on them, so it
 * stops before them.
 */
export const recordStopOrder = (
  stopOrder: readonly ProviderStopEntry[],
  heldKeys?: readonly string[]
): void => {
  pikkuState(null, 'package', 'providerStopOrder', [...stopOrder])
  pikkuState(
    null,
    'package',
    'providerHeldKeys',
    heldKeys ? [...heldKeys] : null
  )
}

export const readHeldKeys = (): readonly string[] | null =>
  pikkuState(null, 'package', 'providerHeldKeys')

export const readStopOrder = (): readonly ProviderStopEntry[] =>
  pikkuState(null, 'package', 'providerStopOrder') ?? []
