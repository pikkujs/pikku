import { useCallback, useEffect, useState } from 'react'

/**
 * One scenario virtual user the switcher offers for one-click sign-in, as
 * `GET /auth/sign-in/virtual-users` lists it. No address and no credential: sign-in
 * names the virtual user by id and the server resolves the rest.
 */
export type DevVirtualUser = {
  id: string
  name: string
  jobTitle: string | null
}

export type SignInAsVirtualUserOptions = {
  /** API base, including the `/api` prefix if the app has one — `/auth/sign-in/switch-virtual-user` is appended. */
  apiUrl: string
  id: string
}

/**
 * Sign in as a declared virtual user through Better Auth's virtual user endpoint — no
 * password and no credential in the bundle.
 *
 * The server decides: `pikkuVirtualUser({ virtualUserSignIn })` refuses unless its
 * its gate is open, and only ever signs in rows flagged `virtualUser: true`, so
 * this can never reach a real user's account.
 */
export const signInAsVirtualUser = async ({
  apiUrl,
  id,
}: SignInAsVirtualUserOptions): Promise<void> => {
  const response = await fetch(`${apiUrl}/auth/sign-in/switch-virtual-user`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id }),
  })
  if (!response.ok) {
    throw new Error(`Unable to sign in as ${id} (${response.status})`)
  }
}

export type ListDevVirtualUsersOptions = {
  /** API base, including the `/api` prefix if the app has one — `/auth/sign-in/virtual-users` is appended. */
  apiUrl: string
  /** Narrows to this app's virtual users when it declares any. */
  app?: string
}

/** The virtual users `pikkuVirtualUser({ virtualUserSignIn })` will sign in — none wherever the switcher is off. */
export const listDevVirtualUsers = async ({
  apiUrl,
  app,
}: ListDevVirtualUsersOptions): Promise<DevVirtualUser[]> => {
  const query = app ? `?app=${encodeURIComponent(app)}` : ''
  const response = await fetch(`${apiUrl}/auth/sign-in/virtual-users${query}`, {
    credentials: 'include',
  })
  if (!response.ok) return []
  return (
    ((await response.json()) as { virtualUsers?: DevVirtualUser[] })
      .virtualUsers ?? []
  )
}

export type UseDevVirtualUsersOptions = ListDevVirtualUsersOptions & {
  /** Called after a successful sign-in — the app owns where that lands. */
  onSignedIn?: () => void | Promise<void>
}

export type UseDevVirtualUsersResult = {
  /** Empty until loaded, and whenever the server offers none — render nothing. */
  virtualUsers: DevVirtualUser[]
  signInAs: (id: string) => void
  /** The virtual user currently signing in, or null. */
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
export const useDevVirtualUsers = ({
  apiUrl,
  app,
  onSignedIn,
}: UseDevVirtualUsersOptions): UseDevVirtualUsersResult => {
  const [virtualUsers, setVirtualUsers] = useState<DevVirtualUser[]>([])
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let live = true
    listDevVirtualUsers({ apiUrl, app })
      .then((listed) => {
        if (live) setVirtualUsers(listed)
      })
      .catch(() => {
        if (live) setVirtualUsers([])
      })
    return () => {
      live = false
    }
  }, [apiUrl, app])

  const signInAs = useCallback(
    (id: string) => {
      setPendingId(id)
      setError(null)
      signInAsVirtualUser({ apiUrl, id })
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
    virtualUsers,
    signInAs,
    pendingId,
    isPending: pendingId !== null,
    error,
  }
}
