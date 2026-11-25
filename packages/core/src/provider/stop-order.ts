import { pikkuState } from '../pikku-state.js'

/**
 * Records the keys `stopSingletonServices` stops first, in order, as the
 * provider runner computed them. Kept in core's state rather than on the
 * services object, which a services factory copies and tests compare.
 */
export const recordStopOrder = (stopOrder: readonly string[]): void => {
  pikkuState(null, 'package', 'providerStopOrder', [...stopOrder])
}

export const readStopOrder = (): readonly string[] =>
  pikkuState(null, 'package', 'providerStopOrder') ?? []
