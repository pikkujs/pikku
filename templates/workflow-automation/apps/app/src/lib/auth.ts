import { createAuthClient } from 'better-auth/client'
import { apiUrl } from './env'

// Better Auth browser client. It targets the worker's catch-all `/api/auth/**`
// routes (generated from src/auth.ts in the functions package). Pass the FULL
// auth base (`<apiUrl>/auth`): better-auth's withPath only appends its default
// `/api/auth` when baseURL has no path, and apiUrl() already carries `/api`, so
// a bare apiUrl() would leave the client calling `/api/get-session` (404) and
// the app would loop back to /app/login. Cookies ride every request so the session
// round-trips across origins.
//
// Lazily constructed: createAuthClient validates baseURL with `new URL()` at
// construction, so building it at module scope crashes SSR (apiUrl() returns
// the relative `/__api` placeholder there). Every caller runs in the browser.
let _authClient: ReturnType<typeof createAuthClient> | null = null
function authClient() {
  _authClient ??= createAuthClient({ baseURL: `${apiUrl()}/auth` })
  return _authClient
}

export type AuthSession = {
  user?: {
    email?: string | null
    name?: string | null
    image?: string | null
  } | null
  expires?: string
}

// Thrown by signInWithPassword when the email/password pair is wrong.
export const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS'
// Thrown by registerWithPassword when the email is already taken.
export const EMAIL_IN_USE = 'EMAIL_IN_USE'

export async function getAuthSession(): Promise<AuthSession> {
  const { data } = await authClient().getSession()
  if (!data?.user) {
    return {}
  }
  return {
    user: {
      email: data.user.email,
      name: data.user.name ?? null,
      image: data.user.image ?? null,
    },
    expires: data.session?.expiresAt ? new Date(data.session.expiresAt).toISOString() : undefined,
  }
}

// Sign in with an email and password. On success Better Auth sets the session
// cookie; on bad credentials this throws INVALID_CREDENTIALS.
export async function signInWithPassword(email: string, password: string, _redirectPath = '/app') {
  const { error } = await authClient().signIn.email({ email, password })
  if (error) {
    throw new Error(INVALID_CREDENTIALS)
  }
}

// Create a new account. Better Auth signs the user in on success (sets the
// session cookie), so they land logged in.
export async function registerWithPassword(
  email: string,
  password: string,
  options: { name?: string; redirectPath?: string } = {},
) {
  const { error } = await authClient().signUp.email({
    email,
    password,
    // Better Auth requires a name; fall back to the local-part of the email.
    name: options.name?.trim() || email.split('@')[0],
  })

  if (error) {
    // Better Auth returns 422 (UNPROCESSABLE_ENTITY) when the email is taken.
    if (error.status === 422 || /exist|taken/i.test(error.message ?? '')) {
      throw new Error(EMAIL_IN_USE)
    }
    throw new Error('Unable to create account')
  }
}

// Scenario personas exposed by the sandbox dev server (empty in production, where
// none of the VITE_DEV_* vars are set). Powers the dev-only "Sign in as" switcher.
export type DevActor = { key: string; email: string; name: string; jobTitle: string }
export function devActors(): DevActor[] {
  const raw = import.meta.env.VITE_DEV_ACTORS
  if (!import.meta.env.DEV || typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error('Failed to parse VITE_DEV_ACTORS', error)
    return []
  }
}

// Sign in as a scenario actor via Better Auth's actor endpoint — no password,
// using the shared secret the sandbox dev server injects. Dev-only.
export async function signInAsActor(email: string): Promise<void> {
  const secret = import.meta.env.VITE_SCENARIO_ACTOR_SECRET
  if (!secret) throw new Error('Actor sign-in is unavailable')
  const res = await fetch(`${apiUrl()}/auth/sign-in/actor`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, secret }),
  })
  if (!res.ok) throw new Error('Unable to sign in as actor')
}

// Continue with Google. Better Auth redirects the browser to the provider and
// back to `callbackURL` on success, so this never resolves on the happy path —
// it throws only when the provider isn't configured / the request is rejected.
// Configure the Google provider in the functions package's auth config to enable
// it; until then the button surfaces the error via useMutation.
export async function signInWithGoogle(callbackURL = '/app') {
  const { error } = await authClient().signIn.social({ provider: 'google', callbackURL })
  if (error) {
    throw new Error('Unable to continue with Google')
  }
}

// Ask Better Auth to email a reset link. `redirectTo` is where the link lands —
// our /app/reset-password route, which reads the token off the query string.
//
// This ALWAYS resolves, even for an address with no account: telling an
// anonymous caller whether an email is registered is account enumeration, so the
// UI shows the same "check your inbox" either way. A transport failure still
// throws, because that one is ours, not the user's.
export async function requestPasswordReset(email: string) {
  const { error } = await authClient().requestPasswordReset({
    email,
    redirectTo: `${window.location.origin}/app/reset-password`,
  })
  if (error) {
    throw new Error('Unable to send the reset email')
  }
}

// Complete the reset with the token from the emailed link. Better Auth rejects a
// token that is expired, already used, or forged — all surface as the same
// message, since the user's next step is identical: request a fresh link.
export const RESET_TOKEN_INVALID = 'RESET_TOKEN_INVALID'

export async function resetPassword(newPassword: string, token: string) {
  const { error } = await authClient().resetPassword({ newPassword, token })
  if (error) {
    throw new Error(RESET_TOKEN_INVALID)
  }
}

// Change the signed-in user's password. Better Auth requires the current
// password to authorize the change.
export async function changePassword(currentPassword: string, newPassword: string) {
  const { error } = await authClient().changePassword({ currentPassword, newPassword })
  if (error) {
    throw new Error('Unable to update password')
  }
}

export async function signOut() {
  const { error } = await authClient().signOut()
  if (error) {
    throw new Error('Unable to sign out')
  }
}
