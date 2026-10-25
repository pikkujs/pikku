import { createBetterAuthClient } from './auth-client.js'
import { createAuthGate } from './auth-gate.js'
import { createSessionRefresh } from './session-refresh.js'

export interface BetterAuthAppOptions<Session> {
  /** The API base the app talks to (already carrying `/api`). */
  apiUrl: () => string
  /** Resolves the signed-in session through the app's RPC client, or throws the signed-out answer. */
  fetchSession: () => Promise<Session>
  /** The router's `redirect` (TanStack Router's, from `@tanstack/react-router`). */
  redirect: (options: { to: string }) => unknown
  /** Where a signed-out visitor is sent. Defaults to `/auth/login`. */
  loginPath?: string
  /** Where a signed-in visitor lands, and where Google returns to. Defaults to `/`. */
  homePath?: string
  /** Where the emailed reset link lands. Defaults to `/auth/reset-password`. */
  resetPasswordPath?: string
}

/**
 * Everything a Better Auth frontend needs besides its screens: the account
 * flows, the cookie refresh, and the route gates. The Pikku CLI generates the
 * one call to this from the app's `clientFiles.authFile`, wiring in the app's
 * own `apiUrl`, RPC client and router.
 */
export const createBetterAuthApp = <Session>(
  options: BetterAuthAppOptions<Session>
) => {
  const loginPath = options.loginPath ?? '/auth/login'
  const homePath = options.homePath ?? '/'
  const client = createBetterAuthClient({
    apiUrl: options.apiUrl,
    resetPasswordPath: options.resetPasswordPath,
    homePath,
  })
  const refresh = createSessionRefresh({ apiUrl: options.apiUrl })
  const gate = createAuthGate({
    fetchSession: options.fetchSession,
    redirect: options.redirect,
    loginPath,
    homePath,
    ...refresh,
  })
  return { ...client, ...refresh, ...gate, homePath, loginPath }
}
