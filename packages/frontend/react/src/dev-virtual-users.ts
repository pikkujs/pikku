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
