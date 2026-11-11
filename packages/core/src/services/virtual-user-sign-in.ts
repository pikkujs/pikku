import { PikkuError } from '../errors/error-handler.js'
import type { ResolvedVirtualUser } from './virtual-users-service.js'
import type { ScenarioCookieJar } from './scenario-cookie-jar.js'
import { VIRTUAL_USER_IN_PROCESS_ENDPOINT } from './virtual-user-statement.js'

/**
 * How a virtual user obtains a session on the target. Both implementations end
 * in the app's one virtual user sign-in handler; they differ in how they get
 * there. See docs/virtual-user-sign-in.md.
 */
export interface VirtualUserSignIn {
  /**
   * Establish a session in `jar`. Throws on failure with a message naming the
   * virtual user, since a run that continues unauthenticated fails later and
   * somewhere less informative.
   */
  login(jar: ScenarioCookieJar, virtualUser: ResolvedVirtualUser): Promise<void>
}

/**
 * A sign-in the target refused. `PikkuError`, not `Error`, so the CLI prints
 * this message alone: a rejected statement or a virtual user the stage has never
 * seen is something to go and fix, and a stack trace through the fetch internals
 * only buries the status and the body that say which one it is.
 */
const failed = async (
  what: string,
  virtualUserId: string,
  res: Response
): Promise<Error> => {
  const body = (await res.text().catch(() => '')).slice(0, 300)
  return new PikkuError(
    `[scenario] ${what} failed for '${virtualUserId}' (${res.status}): ${body}`
  )
}

/**
 * The auth mount a configured sign-in path sits under, or `undefined` when it
 * names nothing recognisable.
 *
 * better-auth serves sign-in and `get-session` from one prefix, so an app that
 * mounts it at `/api/auth` moves both together and says so once through
 * `signInPath`. Reading `get-session` from a hardcoded `/auth` on such an app
 * 404s, and a 404 reads as "this stage does not report roles", which silently
 * turns off the check that tells a permissions finding from seed drift.
 */
export const authMount = (signInPath?: string): string | undefined => {
  const mount = signInPath ? signInPath.lastIndexOf('/sign-in/') : -1
  return !signInPath || mount === -1 ? undefined : signInPath.slice(0, mount)
}

/** Signs one statement naming `virtualUser`, for an audience the signer knows. */
export type VirtualUserStatementMint = (
  virtualUser: ResolvedVirtualUser
) => string | Promise<string>

/** Options for {@link statementSignIn}. */
export interface StatementSignInOptions {
  apiUrl: string
  /** Default `/auth/sign-in/virtual-user`. */
  signInPath?: string
  mint: VirtualUserStatementMint
}

/**
 * Sign in from outside the app by presenting a signed statement.
 *
 * A fresh statement is minted per login, because each is single-use: the re-login
 * after a 401 must not replay the first.
 */
export const statementSignIn = ({
  apiUrl,
  signInPath = '/auth/sign-in/virtual-user',
  mint,
}: StatementSignInOptions): VirtualUserSignIn => ({
  async login(jar, virtualUser) {
    const res = await jar.fetch(`${apiUrl}${signInPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ statement: await mint(virtualUser) }),
    })
    if (res.status === 404) {
      throw new PikkuError(
        `[scenario] ${apiUrl}${signInPath} does not exist, so '${virtualUser.id}' cannot sign in. ` +
          `The target has no VIRTUAL_USER_VERIFY_KEY set, or does not serve virtual user sign-in at all (production never does).`
      )
    }
    if (!res.ok) {
      throw await failed('virtual user sign-in', virtualUser.id, res)
    }
    // What proves a session was established is this response setting a cookie,
    // not the jar being non-empty: the target may have set one earlier.
    if (res.headers.getSetCookie().length === 0) {
      throw new PikkuError(
        `[scenario] virtual user sign-in for '${virtualUser.id}' returned no session cookie`
      )
    }
  },
})

/** The part of an auth instance an in-process sign-in needs. */
export interface InProcessAuth {
  api: Record<string, any>
}

/**
 * Sign in from inside the app, with no credential: the code asking is the app.
 *
 * Calls the server-only endpoint through `auth.api`, which the HTTP router
 * never serves, and takes the session cookie from the response.
 */
export const inProcessSignIn = (auth: InProcessAuth): VirtualUserSignIn => ({
  async login(jar, virtualUser) {
    const endpoint = auth.api[VIRTUAL_USER_IN_PROCESS_ENDPOINT]
    if (typeof endpoint !== 'function') {
      throw new PikkuError(
        `[scenario] '${virtualUser.id}' cannot sign in: the app's auth has no virtual user sign-in. ` +
          `Add the pikkuVirtualUser plugin from @pikku/better-auth, and note it is only registered under pikku dev or the stage opt-in.`
      )
    }
    const res: Response = await endpoint({
      body: { email: virtualUser.email, name: virtualUser.name },
      asResponse: true,
    })
    if (!res.ok) {
      throw await failed('virtual user sign-in', virtualUser.id, res)
    }
    const cookies = res.headers.getSetCookie()
    if (cookies.length === 0) {
      throw new PikkuError(
        `[scenario] virtual user sign-in for '${virtualUser.id}' returned no session cookie`
      )
    }
    jar.absorb(cookies)
  },
})
