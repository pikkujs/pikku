import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * One scenario persona the switcher offers for one-click sign-in, as the app's
 * `listDevActors` function returns it (`listDevActors` from
 * `@pikku/better-auth`). No address and no credential: sign-in names the
 * persona by id and the server resolves the rest.
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
 * `allowed()` says yes, and only ever signs in rows flagged `actor: true`, so
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

export type UseDevActorsOptions = {
  /**
   * Fetches the personas to offer — the app's `listDevActors` RPC, e.g.
   * `() => rpc.invoke('listDevActors', { app })`. Called once on mount; the
   * server returns none wherever the switcher is off.
   */
  list: () => Promise<{ actors: DevActor[] }>
  apiUrl: string
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
  list,
  apiUrl,
  onSignedIn,
}: UseDevActorsOptions): UseDevActorsResult => {
  const [actors, setActors] = useState<DevActor[]>([])
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const listRef = useRef(list)
  listRef.current = list

  useEffect(() => {
    let live = true
    listRef
      .current()
      .then((result) => {
        if (live) setActors(result?.actors ?? [])
      })
      .catch(() => {
        if (live) setActors([])
      })
    return () => {
      live = false
    }
  }, [])

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
