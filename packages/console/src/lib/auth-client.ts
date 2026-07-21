import { createAuthClient } from 'better-auth/client'
import { AUTH_BASE_PATH } from '../context/serverUrl'

export type ConsoleAuthClient = ReturnType<typeof createConsoleAuthClient>

/**
 * Better Auth browser client for the console, pointed at the backend the console
 * is currently connected to (`serverUrl`). It handles sign-in, sign-out and the
 * session only — administration is pikku's, not better-auth's: the user
 * directory comes from the `console:listUsers` RPC and impersonation from
 * pikku's own `x-pikku-impersonate-user-id` header, both gated on scopes.
 *
 * `credentials: 'include'` sends the session cookie on every request so the
 * cookie round-trips across the console ↔ backend origins — the same cookie the
 * Pikku RPC client uses, so impersonating swaps the identity for RPC calls too.
 */
export const createConsoleAuthClient = (serverUrl: string) =>
  createAuthClient({
    baseURL: serverUrl,
    basePath: AUTH_BASE_PATH,
    fetchOptions: { credentials: 'include' },
  })
