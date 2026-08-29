import { useCallback, useMemo, useState } from 'react'

/**
 * One scenario persona the sandbox offers for one-click sign-in.
 *
 * These are the personas declared with `definePersonas` — the same source
 * `pikku scenario` and the console read. The address is not written down
 * anywhere: it is derived from the persona id and `scenarios.emailDomain`, and
 * the dev seed creates `actor: true` user rows at exactly those addresses.
 */
export type DevActor = {
  key: string
  email: string
  name: string
  jobTitle: string
}

/**
 * Parse the actor list a dev server bakes into the frontend bundle.
 *
 * The raw value is JSON, supplied by the host: `import.meta.env.VITE_DEV_ACTORS`
 * under Vite, `process.env.NEXT_PUBLIC_DEV_ACTORS` under Next. This package
 * deliberately does not read env itself — how env is spelled is a bundler fact,
 * and a package that guesses gets it wrong for half its consumers.
 *
 * Anything unparseable yields an empty list rather than throwing: a broken dev
 * affordance must not take the login screen down with it.
 */
export const parseDevActors = (raw: unknown): DevActor[] => {
  if (typeof raw !== 'string' || raw.length === 0) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (actor): actor is DevActor =>
        !!actor &&
        typeof actor === 'object' &&
        typeof actor.key === 'string' &&
        typeof actor.email === 'string' &&
        // `name` and `jobTitle` are what the switcher DRAWS, so an entry missing
        // either is not a usable actor — it is a menu row reading "undefined".
        typeof actor.name === 'string' &&
        typeof actor.jobTitle === 'string'
    )
  } catch {
    return []
  }
}

export type SignInAsActorOptions = {
  /** API base, including the `/api` prefix if the app has one — `/auth/sign-in/actor` is appended. */
  apiUrl: string
  email: string
  /** That address's own actor credential. Dev-only; never present in a production bundle. */
  secret: string
}

/**
 * Sign in as a scenario actor through Better Auth's actor endpoint — no
 * password, using the credential the dev server minted for that address.
 *
 * The credential is bound to the address, so it signs in as that persona and
 * no other, and the endpoint only accepts rows flagged `actor: true` — so this
 * can never impersonate a real user however a credential leaks. See the `actor`
 * plugin in `@pikku/better-auth`.
 */
export const signInAsActor = async ({
  apiUrl,
  email,
  secret,
}: SignInAsActorOptions): Promise<void> => {
  const response = await fetch(`${apiUrl}/auth/sign-in/actor`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, secret }),
  })
  if (!response.ok) {
    throw new Error(`Unable to sign in as ${email} (${response.status})`)
  }
}

/** Address → that address's own actor credential. */
export type DevActorSecrets = Record<string, string>

/**
 * Parse the credential map a dev server bakes into the bundle
 * (`import.meta.env.VITE_DEV_ACTOR_SECRETS`). Unparseable yields none, for the
 * same reason a broken actor list does: the login screen must still render.
 */
export const parseDevActorSecrets = (raw: unknown): DevActorSecrets => {
  if (typeof raw === 'object' && raw !== null) return raw as DevActorSecrets
  if (typeof raw !== 'string' || raw.length === 0) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
  } catch {
    return {}
  }
}

export type UseDevActorsOptions = {
  /** Raw JSON actor list from the host's env, or an already-parsed list. */
  actors: string | DevActor[] | undefined
  /**
   * One credential per persona, keyed by address — raw JSON from the host's
   * env, or an already-parsed map. An actor with no credential here is not
   * offered.
   *
   * A map rather than one value: the root secret every credential derives from
   * is entitled to every persona, so a bundle must never hold it. `pikku dev`
   * mints these and exports them as `VITE_DEV_ACTOR_SECRETS`.
   */
  secrets: string | DevActorSecrets | undefined
  apiUrl: string
  /** Called after a successful sign-in — the app owns where that lands. */
  onSignedIn?: () => void | Promise<void>
}

export type UseDevActorsResult = {
  /** Empty whenever the host exposed no actors or no credentials — render nothing. */
  actors: DevActor[]
  signInAs: (email: string) => void
  /** The address currently signing in, or null. */
  pendingEmail: string | null
  isPending: boolean
  error: Error | null
}

/**
 * State for the dev-only "Sign in as …" switcher.
 *
 * Returns an empty actor list unless the host supplied BOTH a list and the
 * credentials for it, so a production bundle — where neither env var is set —
 * renders nothing without the caller testing for it. Hosts should still gate
 * the env reads on their dev flag (`import.meta.env.DEV`) so no credential is
 * emitted into a production bundle in the first place; this is the second line,
 * not the first.
 */
export const useDevActors = ({
  actors: rawActors,
  secrets: rawSecrets,
  apiUrl,
  onSignedIn,
}: UseDevActorsOptions): UseDevActorsResult => {
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const secrets = useMemo(() => parseDevActorSecrets(rawSecrets), [rawSecrets])

  const actors = useMemo(() => {
    const declared = Array.isArray(rawActors)
      ? rawActors
      : parseDevActors(rawActors)
    // An actor with no credential would render a row that 401s on click.
    return declared.filter((actor) => !!secrets[actor.email])
  }, [rawActors, secrets])

  const signInAs = useCallback(
    (email: string) => {
      const secret = secrets[email]
      if (!secret) return
      setPendingEmail(email)
      setError(null)
      signInAsActor({ apiUrl, email, secret })
        .then(async () => {
          await onSignedIn?.()
        })
        .catch((cause) => {
          setError(cause instanceof Error ? cause : new Error(String(cause)))
        })
        .finally(() => {
          setPendingEmail(null)
        })
    },
    [apiUrl, secrets, onSignedIn]
  )

  return {
    actors,
    signInAs,
    pendingEmail,
    isPending: pendingEmail !== null,
    error,
  }
}
