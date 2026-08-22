import type { ResolvedPersona } from './personas-service.js'
import type { ScenarioCookieJar } from '../wirings/workflow/scenario-cookie-jar.js'

/**
 * The header `resolveImpersonatedSession` reads the target user id from.
 *
 * A wire value rather than a shared import: the reader lives in
 * `@pikku/services-better-auth`, which depends on core, so core cannot import
 * it back. The two agree by protocol, the way an HTTP header always does.
 */
export const IMPERSONATE_USER_ID_HEADER = 'x-pikku-impersonate-user-id'

/**
 * How a persona obtains a session on the target, and what every later request
 * needs to carry to keep acting as them.
 *
 * Two answers exist because the two environments have opposite trust models,
 * not because one is a fallback for the other. See {@link ActorSignIn} and
 * {@link OperatorSignIn}.
 */
export interface PersonaSignIn {
  /**
   * Establish a session in `jar`. Throws on failure with a message naming the
   * persona, since a run that continues unauthenticated fails later and
   * somewhere less informative.
   */
  login(jar: ScenarioCookieJar, persona: ResolvedPersona): Promise<void>
  /** Headers every request after `login` must carry. */
  headers(): Record<string, string>
}

const failed = async (
  what: string,
  personaId: string,
  res: Response
): Promise<Error> => {
  const body = (await res.text().catch(() => '')).slice(0, 300)
  return new Error(
    `[scenario] ${what} failed for '${personaId}' (${res.status}): ${body}`
  )
}

/**
 * Sign a persona in through the Better Auth actor plugin — the local-development
 * path.
 *
 * `POST /auth/sign-in/actor` upserts an `actor: true` row and mints a session
 * for it. Passwordless by design and refused for any row not carrying that flag,
 * so the secret can never reach a real user's account; the plugin still declines
 * to serve the endpoint at all outside `pikku dev`.
 */
export class ActorSignIn implements PersonaSignIn {
  constructor(
    private readonly apiUrl: string,
    private readonly secret: string,
    private readonly signInPath: string
  ) {}

  async login(jar: ScenarioCookieJar, persona: ResolvedPersona): Promise<void> {
    const res = await jar.fetch(`${this.apiUrl}${this.signInPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: persona.email,
        name: persona.name,
        secret: this.secret,
      }),
    })
    if (!res.ok) {
      throw await failed('persona sign-in', persona.id, res)
    }
    // What proves a session was established is this response setting a cookie,
    // not the jar being non-empty — the target may have set one earlier.
    if (res.headers.getSetCookie().length === 0) {
      throw new Error(
        `[scenario] persona sign-in for '${persona.id}' returned no session cookie`
      )
    }
  }

  headers(): Record<string, string> {
    return {}
  }
}

export interface OperatorSignInOptions {
  /**
   * The short-lived RS256 operator token, or a function that mints one. Prefer
   * the function: tokens expire, and a long run re-logs-in after a 401.
   */
  token: string | (() => string | Promise<string>)
  /**
   * Create the persona's user row when the target has no account for that
   * address.
   *
   * Off by default, which is the whole point of the deployed path: a persona is
   * meant to be a real account somebody provisioned, and a test run that
   * silently writes users into a live database is a side effect nobody asked
   * for. Turn it on for throwaway stages.
   */
  createMissing?: boolean
  /** Admin endpoint prefix under apiUrl. Default `/auth/admin`. */
  adminPath?: string
  /** Fabric operator sign-in path under apiUrl. Default `/auth/sign-in/fabric`. */
  signInPath?: string
}

interface AdminUser {
  id?: unknown
  email?: unknown
}

/** What an operator handshake yields: the session, and who to act as. */
export interface OperatorSessionResult {
  /** `Set-Cookie` values the operator sign-in returned. */
  setCookies: string[]
  /** The target's own id for the persona, for the impersonation header. */
  userId: string
}

/**
 * Establish a Fabric operator session against `apiUrl` and resolve the target's
 * own id for `persona`, which is what the impersonation header names.
 *
 * Takes the fetch to use rather than making one, because the two callers need
 * the cookies to land in different places: an HTTP persona keeps them in its
 * jar, a browser run plants them on a Playwright context. Both need the same
 * handshake, and it is the kind of sequence that quietly diverges once it is
 * written twice.
 */
export const establishOperatorSession = async (
  fetchImpl: typeof fetch,
  apiUrl: string,
  persona: ResolvedPersona,
  options: OperatorSignInOptions,
  extraHeaders: Record<string, string> = {}
): Promise<OperatorSessionResult> => {
  const signInPath = options.signInPath ?? '/auth/sign-in/fabric'
  const token =
    typeof options.token === 'function' ? await options.token() : options.token

  const res = await fetchImpl(`${apiUrl}${signInPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify({ token }),
  })
  if (!res.ok) {
    throw await failed('operator sign-in', persona.id, res)
  }
  const setCookies = res.headers.getSetCookie?.() ?? []
  if (setCookies.length === 0) {
    throw new Error(
      `[scenario] operator sign-in for '${persona.id}' returned no session cookie`
    )
  }

  // The lookup runs on the session this handshake just established, and a
  // plain `fetch` keeps no cookies — the browser path in particular hands the
  // jar's contents to Playwright only after this returns. Forwarding them
  // explicitly is what keeps the admin calls authenticated for every caller.
  const session = setCookies
    .map((raw) => raw.split(';')[0])
    .filter((pair): pair is string => Boolean(pair))
    .join('; ')

  const userId = await resolveUserId(fetchImpl, apiUrl, persona, options, {
    ...extraHeaders,
    cookie: session,
  })
  return { setCookies, userId }
}

/**
 * The target's own id for this persona's address, since impersonation names a
 * user id and a persona only knows an email.
 *
 * Looked up before creating, so a persona that already exists is never
 * duplicated and the run reads as "act as this person" rather than "make one".
 */
const resolveUserId = async (
  fetchImpl: typeof fetch,
  apiUrl: string,
  persona: ResolvedPersona,
  options: OperatorSignInOptions,
  extraHeaders: Record<string, string>
): Promise<string> => {
  const adminPath = options.adminPath ?? '/auth/admin'
  const query = new URLSearchParams({
    filterField: 'email',
    filterValue: persona.email,
    filterOperator: 'eq',
    limit: '1',
  })
  const found = await fetchImpl(`${apiUrl}${adminPath}/list-users?${query}`, {
    headers: { accept: 'application/json', ...extraHeaders },
  })
  if (!found.ok) {
    throw await failed('persona lookup', persona.id, found)
  }
  const listed = (await found.json().catch(() => null)) as {
    users?: AdminUser[]
  } | null
  const existing = listed?.users?.find((u) => u.email === persona.email)
  if (existing?.id) {
    return String(existing.id)
  }

  if (!options.createMissing) {
    throw new Error(
      `[scenario] no account on the target for persona '${persona.id}' (${persona.email}) — ` +
        'provision it, or set createMissing on the operator credentials'
    )
  }

  const created = await fetchImpl(`${apiUrl}${adminPath}/create-user`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify({
      email: persona.email,
      name: persona.name,
      // Never used and never returned: the run impersonates rather than signs
      // in, so the account is reachable only by someone already holding an
      // operator token. A derivable password would undo exactly that.
      password: globalThis.crypto.randomUUID(),
      ...(persona.roles[0] ? { role: persona.roles[0] } : {}),
    }),
  })
  if (!created.ok) {
    throw await failed('persona creation', persona.id, created)
  }
  const body = (await created.json().catch(() => null)) as {
    user?: AdminUser
  } | null
  const id = body?.user?.id
  if (!id) {
    throw new Error(
      `[scenario] creating persona '${persona.id}' returned no user id`
    )
  }
  return String(id)
}

/**
 * Sign a persona in on a DEPLOYED stage, by having a Fabric operator act as
 * them — the path that needs no test credential to exist anywhere.
 *
 * `POST /auth/sign-in/fabric` verifies an RS256 token against the stage's
 * `FABRIC_AUTH_PUBLIC_KEY` and mints a session for a synthetic operator row
 * granted the umbrella `admin` scope. Impersonation is then a header on each
 * request rather than a second session, and its gate is that scope — not
 * `user.role`, which is why this works without touching the app's roles.
 *
 * Asymmetric throughout: the stage can verify an operator token and never mint
 * one, so nothing in a deployed environment is worth stealing. That is the
 * property the actor secret cannot have, and the reason these are two classes
 * instead of one with a flag.
 */
export class OperatorSignIn implements PersonaSignIn {
  private userId: string | null = null

  constructor(
    private readonly apiUrl: string,
    private readonly options: OperatorSignInOptions
  ) {}

  async login(jar: ScenarioCookieJar, persona: ResolvedPersona): Promise<void> {
    const { userId } = await establishOperatorSession(
      jar.fetch,
      this.apiUrl,
      persona,
      this.options
    )
    this.userId = userId
  }

  headers(): Record<string, string> {
    if (!this.userId) {
      throw new Error(
        '[scenario] operator session has no persona to act as — login() first'
      )
    }
    return { [IMPERSONATE_USER_ID_HEADER]: this.userId }
  }
}
