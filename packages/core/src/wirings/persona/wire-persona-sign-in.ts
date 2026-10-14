import { pikkuState } from '../../pikku-state.js'
import type { PersonaSignInFactory } from '../../services/persona-sign-in.js'

/**
 * Registers how personas sign in to this app, for every consumer that signs one
 * in: the deployed app's virtual-user runs, `pikku persona run`,
 * `pikku scenario run`, `pikku persona rpc` and the browser driver.
 *
 * Call it once, at module level, in a file the app bootstraps. When it is set
 * the operator token and the actor secret are not read at all.
 */
export const wirePersonaSignIn = (factory: PersonaSignInFactory): void => {
  pikkuState(null, 'persona', 'signIn', factory)
}

export const getWiredPersonaSignIn = (): PersonaSignInFactory | null =>
  pikkuState(null, 'persona', 'signIn')
