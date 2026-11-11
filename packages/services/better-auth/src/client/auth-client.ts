import { createAuthClient } from 'better-auth/client'

/** Thrown by signInWithPassword when the email/password pair is wrong. */
export const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS'
/** Thrown by registerWithPassword when the email is already taken. */
export const EMAIL_IN_USE = 'EMAIL_IN_USE'
/**
 * Thrown by resetPassword. Better Auth rejects a token that is expired, already
 * used, or forged, and all three surface as the same message, since the user's
 * next step is identical: request a fresh link.
 */
export const RESET_TOKEN_INVALID = 'RESET_TOKEN_INVALID'

export type AuthSession = {
  user?: {
    email?: string | null
    name?: string | null
    image?: string | null
  } | null
  expires?: string
}

export interface BetterAuthClientOptions {
  /** The API base the app talks to (already carrying `/api`); the auth routes live under `<apiUrl>/auth`. */
  apiUrl: () => string
  /** Where the emailed reset link lands (the app's reset-password route). Defaults to `/auth/reset-password`. */
  resetPasswordPath?: string
  /** Where Google sends the browser back to after sign-in. Defaults to `/`. */
  homePath?: string
}

/**
 * The Better Auth browser client and the account flows an app's screens call.
 *
 * It targets the API's catch-all `/auth/**` routes. The FULL auth base
 * (`<apiUrl>/auth`) is passed: better-auth's withPath only appends its default
 * `/api/auth` when baseURL has no path, and apiUrl() already carries `/api`, so
 * a bare apiUrl() would leave the client calling `/api/get-session` (404) and the
 * app would loop back to login. Cookies ride every request so the session
 * round-trips across origins.
 *
 * Lazily constructed: createAuthClient validates baseURL with `new URL()` at
 * construction, so building it at module scope crashes SSR (apiUrl() returns a
 * relative placeholder there). Every caller runs in the browser.
 */
export const createBetterAuthClient = ({
  apiUrl,
  resetPasswordPath = '/auth/reset-password',
  homePath = '/',
}: BetterAuthClientOptions) => {
  let client: ReturnType<typeof createAuthClient> | null = null
  const authClient = () => {
    client ??= createAuthClient({ baseURL: `${apiUrl()}/auth` })
    return client
  }

  return {
    authClient,

    async getAuthSession(): Promise<AuthSession> {
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
        expires: data.session?.expiresAt
          ? new Date(data.session.expiresAt).toISOString()
          : undefined,
      }
    },

    /**
     * Sign in with an email and password. On success Better Auth sets the
     * session cookie; on bad credentials this throws INVALID_CREDENTIALS.
     */
    async signInWithPassword(email: string, password: string) {
      const { error } = await authClient().signIn.email({ email, password })
      if (error) {
        throw new Error(INVALID_CREDENTIALS)
      }
    },

    /**
     * Create a new account. Better Auth signs the user in on success (sets the
     * session cookie), so they land logged in.
     */
    async registerWithPassword(
      email: string,
      password: string,
      options: { name?: string } = {}
    ) {
      const { error } = await authClient().signUp.email({
        email,
        password,
        // Better Auth requires a name; fall back to the local-part of the email.
        name: options.name?.trim() || email.split('@')[0]!,
      })

      if (error) {
        // Better Auth returns 422 (UNPROCESSABLE_ENTITY) when the email is taken.
        if (error.status === 422 || /exist|taken/i.test(error.message ?? '')) {
          throw new Error(EMAIL_IN_USE)
        }
        throw new Error('Unable to create account')
      }
    },

    /**
     * Continue with Google. Better Auth redirects the browser to the provider
     * and back to `callbackURL` on success, so this never resolves on the happy
     * path — it throws only when the provider isn't configured or the request is
     * rejected.
     */
    async signInWithGoogle(callbackURL = homePath) {
      const { error } = await authClient().signIn.social({
        provider: 'google',
        callbackURL,
      })
      if (error) {
        throw new Error('Unable to continue with Google')
      }
    },

    /**
     * Ask Better Auth to email a reset link. `redirectTo` is where the link
     * lands — the app's reset-password route, which reads the token off the
     * query string.
     *
     * This ALWAYS resolves, even for an address with no account: telling an
     * anonymous caller whether an email is registered is account enumeration, so
     * the UI shows the same "check your inbox" either way. A transport failure
     * still throws, because that one is ours, not the user's.
     */
    async requestPasswordReset(email: string) {
      const { error } = await authClient().requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}${resetPasswordPath}`,
      })
      if (error) {
        throw new Error('Unable to send the reset email')
      }
    },

    /** Complete the reset with the token from the emailed link. */
    async resetPassword(newPassword: string, token: string) {
      const { error } = await authClient().resetPassword({ newPassword, token })
      if (error) {
        throw new Error(RESET_TOKEN_INVALID)
      }
    },

    /** Change the signed-in user's password; Better Auth requires the current one. */
    async changePassword(currentPassword: string, newPassword: string) {
      const { error } = await authClient().changePassword({
        currentPassword,
        newPassword,
      })
      if (error) {
        throw new Error('Unable to update password')
      }
    },

    async signOut() {
      const { error } = await authClient().signOut()
      if (error) {
        throw new Error('Unable to sign out')
      }
    },
  }
}
