import { useCallback, useEffect, useState } from 'react'

/**
 * One scenario persona the switcher offers for one-click sign-in, as
 * `GET /auth/sign-in/personas` lists it. No address and no credential: sign-in
 * names the persona by id and the server resolves the rest.
 */
export type DevActor = {
  id: string
  name: string
  jobTitle: string | null
}

export type SignInAsPersonaOptions = {
  /** API base, including the `/api` prefix if the app has one — `/auth/sign-in/persona` is appended. */
  apiUrl: string
  id: string
}

/**
 * Sign in as a declared persona through Better Auth's persona endpoint — no
 * password and no credential in the bundle.
 *
 * The server decides: `pikkuActor({ personaSignIn })` refuses unless its
 * its gate is open, and only ever signs in rows flagged `actor: true`, so
 * this can never reach a real user's account.
 */
export const signInAsPersona = async ({
  apiUrl,
  id,
}: SignInAsPersonaOptions): Promise<void> => {
  const response = await fetch(`${apiUrl}/auth/sign-in/persona`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id }),
  })
  if (!response.ok) {
    throw new Error(`Unable to sign in as ${id} (${response.status})`)
  }
}

export type ListDevActorsOptions = {
  /** API base, including the `/api` prefix if the app has one — `/auth/sign-in/personas` is appended. */
  apiUrl: string
  /** Narrows to this app's personas when it declares any. */
  app?: string
}

/** The personas `pikkuActor({ personaSignIn })` will sign in — none wherever the switcher is off. */
export const listDevActors = async ({
  apiUrl,
  app,
}: ListDevActorsOptions): Promise<DevActor[]> => {
  const query = app ? `?app=${encodeURIComponent(app)}` : ''
  const response = await fetch(`${apiUrl}/auth/sign-in/personas${query}`, {
    credentials: 'include',
  })
  if (!response.ok) return []
  return ((await response.json()) as { actors?: DevActor[] }).actors ?? []
}

export type UseDevActorsOptions = ListDevActorsOptions & {
  /** Called after a successful sign-in — the app owns where that lands. */
  onSignedIn?: () => void | Promise<void>
}

export type UseDevActorsResult = {
  /** Empty until loaded, and whenever the server offers none — render nothing. */
  actors: DevActor[]
  signInAs: (id: string) => void
  /** The persona currently signing in, or null. */
  pendingId: string | null
  isPending: boolean
  error: Error | null
}

/**
 * State for the "Sign in as …" switcher.
 *
 * A listing that fails leaves the list empty rather than surfacing an error:
 * a broken dev affordance must not take the login screen down with it.
 */
export const useDevActors = ({
  apiUrl,
  app,
  onSignedIn,
}: UseDevActorsOptions): UseDevActorsResult => {
  const [actors, setActors] = useState<DevActor[]>([])
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let live = true
    listDevActors({ apiUrl, app })
      .then((listed) => {
        if (live) setActors(listed)
      })
      .catch(() => {
        if (live) setActors([])
      })
    return () => {
      live = false
    }
  }, [apiUrl, app])

  const signInAs = useCallback(
    (id: string) => {
      setPendingId(id)
      setError(null)
      signInAsPersona({ apiUrl, id })
        .then(async () => {
          await onSignedIn?.()
        })
        .catch((cause) => {
          setError(cause instanceof Error ? cause : new Error(String(cause)))
        })
        .finally(() => {
          setPendingId(null)
        })
    },
    [apiUrl, onSignedIn]
  )

  return {
    actors,
    signInAs,
    pendingId,
    isPending: pendingId !== null,
    error,
  }
}
