import { isUnauthorized } from './is-unauthorized.js'

export interface AuthGateOptions<Session> {
  /** Resolves the signed-in session, or throws the server's signed-out answer. */
  fetchSession: () => Promise<Session>
  refreshSessionCookie: () => Promise<boolean>
  startSessionRefresh: () => void
  /** The router's `redirect`; the gate throws what it returns. */
  redirect: (options: { to: string }) => unknown
  /** Where a signed-out visitor is sent. */
  loginPath: string
  /** Where a signed-in visitor on an auth screen is sent. */
  homePath: string
}

/**
 * Route gates for `beforeLoad`. They run before the route's component mounts, so
 * a signed-out visitor never sees the app shell first — which effect-based hooks
 * could not prevent, because effects fire after the first render.
 *
 * `isUnauthorized` decides what "signed out" means — pikku says it with a 403,
 * not a 401. Anything else is a real failure and is rethrown so the error
 * boundary shows it instead of silently bouncing to login.
 *
 * These run during SSR too, and must: a gate that only runs in the browser means
 * the server sends an empty document and the route is invisible to a cold load.
 * `rpc()` forwards the request's cookie on the server, so the session resolves
 * there and a signed-out visitor gets a real redirect instead of a flash of app
 * shell. Never add `ssr: false` to a route to make a gate work.
 */
export const createAuthGate = <Session>({
  fetchSession,
  refreshSessionCookie,
  startSessionRefresh,
  redirect,
  loginPath,
  homePath,
}: AuthGateOptions<Session>) => {
  const requireAuthentication = async (): Promise<{ session: Session }> => {
    try {
      const session = await fetchSession()
      /* Signed in: keep the cookie from ageing out under them. Idempotent. */
      startSessionRefresh()
      return { session }
    } catch (error) {
      if (!isUnauthorized(error)) throw error

      /*
       * Signed out, or merely stale? The API reads one short-lived cookie and has no
       * database behind it, so a user whose `session_data` aged out looks exactly like
       * one who never signed in — while their `session_token` is still good. Ask Better
       * Auth to rebuild the cookie from the session it has on record, and if that
       * produces one, the answer was stale rather than absent. Only a second refusal is
       * a real sign-out. See session-refresh.ts.
       */
      if (await refreshSessionCookie()) {
        try {
          const session = await fetchSession()
          startSessionRefresh()
          return { session }
        } catch (retryError) {
          if (!isUnauthorized(retryError)) throw retryError
        }
      }

      throw redirect({ to: loginPath })
    }
  }

  const redirectIfAuthenticated = async (): Promise<void> => {
    try {
      await fetchSession()
    } catch (error) {
      if (!isUnauthorized(error)) {
        console.error(
          'Could not check the session before showing an auth screen',
          error
        )
      }
      return
    }
    throw redirect({ to: homePath })
  }

  return { requireAuthentication, redirectIfAuthenticated }
}
