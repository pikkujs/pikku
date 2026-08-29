import { deriveActorSecret } from './persona-actor-secret.js'
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
 * Yields the credential for one persona, for a caller that holds that persona's
 * derived secret and not the root it came from.
 */
export type ActorSecretResolver = (
  persona: ResolvedPersona
) => string | Promise<string>

/**
 * Sign a persona in through the Better Auth actor plugin — the local-development
 * path.
 *
 * `POST /auth/sign-in/actor` upserts an `actor: true` row and mints a session
 * for it. Passwordless by design and refused for any row not carrying that flag,
 * so the secret can never reach a real user's account; the plugin still declines
 * to serve the endpoint at all outside `pikku dev`.
 *
 * What is presented is the persona's own credential, derived from the root and
 * bound to their address. A run driving many personas holds the root and
 * derives as it goes; a run entitled to one persona is handed that one value
 * through a resolver and can sign in as nobody else.
 */
export class ActorSignIn implements PersonaSignIn {
  constructor(
    private readonly apiUrl: string,
    private readonly secret: string | ActorSecretResolver,
    private readonly signInPath: string
  ) {}

  async login(jar: ScenarioCookieJar, persona: ResolvedPersona): Promise<void> {
    const secret =
      typeof this.secret === 'function'
        ? await this.secret(persona)
        : await deriveActorSecret(this.secret, persona.email)
    const res = await jar.fetch(`${this.apiUrl}${this.signInPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: persona.email,
        name: persona.name,
        secret,
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
  /** Fabric operator sign-in path under apiUrl. Default `/auth/sign-in/fabric`. */
  signInPath?: string
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
    body: JSON.stringify({
      token,
      actAs: {
        email: persona.email,
        name: persona.name,
        create: options.createMissing ?? false,
        ...(persona.roles[0] ? { role: persona.roles[0] } : {}),
      },
    }),
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

  const body = (await res.json().catch(() => null)) as {
    actAs?: { userId?: unknown }
  } | null
  const userId = body?.actAs?.userId
  if (!userId) {
    throw new Error(
      `[scenario] operator sign-in for '${persona.id}' returned no user to act as — ` +
        'the target is running a @pikku/better-auth too old to resolve one'
    )
  }
  return { setCookies, userId: String(userId) }
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
