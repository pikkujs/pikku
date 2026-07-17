import { createAuthClient } from 'better-auth/client'
import { adminClient } from 'better-auth/client/plugins'
import { AUTH_BASE_PATH } from '../context/serverUrl'

export type ConsoleAuthClient = ReturnType<typeof createConsoleAuthClient>

/**
 * Better Auth browser client for the console, pointed at the backend the console
 * is currently connected to (`serverUrl`). The `adminClient` plugin adds the
 * admin/impersonation endpoints (`admin.listUsers`, `admin.impersonateUser`,
 * `admin.stopImpersonating`) and the `role`/`banned` fields on the session user.
 *
 * `credentials: 'include'` sends the session cookie on every request so the
 * cookie round-trips across the console ↔ backend origins — the same cookie the
 * Pikku RPC client uses, so impersonating swaps the identity for RPC calls too.
 */
export const createConsoleAuthClient = (serverUrl: string) =>
  createAuthClient({
    baseURL: serverUrl,
    basePath: AUTH_BASE_PATH,
    plugins: [adminClient()],
    fetchOptions: { credentials: 'include' },
  })
