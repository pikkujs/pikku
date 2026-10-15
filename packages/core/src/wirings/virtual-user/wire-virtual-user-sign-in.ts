import { pikkuState } from '../../pikku-state.js'
import type { VirtualUserSignInFactory } from '../../services/virtual-user-sign-in.js'

/**
 * Registers how virtual users sign in to this app, for every consumer that signs
 * one in: the deployed app's virtual-user runs, `pikku virtual-user run`,
 * `pikku scenario run`, `pikku virtual-user rpc` and the browser driver.
 *
 * Call it once, at module level, in a file the app bootstraps. When it is set
 * the operator token and the virtual user secret are not read at all.
 */
export const wireVirtualUserSignIn = (
  factory: VirtualUserSignInFactory
): void => {
  pikkuState(null, 'virtualUser', 'signIn', factory)
}

export const getWiredVirtualUserSignIn = (): VirtualUserSignInFactory | null =>
  pikkuState(null, 'virtualUser', 'signIn')
