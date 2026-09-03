import { createContext, useContext } from 'react'
import { AuthContext, type AuthContextValue } from './AuthContext'

/**
 * Everything the user-directory UI needs in order to act: the six calls, and
 * the scope check that decides which of them to offer.
 *
 * A subset of {@link AuthContextValue}, deliberately — the directory does not
 * need a session, a sign-in or a server URL, and asking for them is what tied
 * these components to `AuthProvider`.
 */
export type UserAdminValue = Pick<
  AuthContextValue,
  | 'can'
  | 'listUsers'
  | 'createUser'
  | 'setUserBanned'
  | 'removeUser'
  | 'revokeUserSessions'
  | 'setUserPassword'
>

const UserAdminContext = createContext<UserAdminValue | null>(null)

/**
 * Supplies the directory UI with somewhere other than `AuthProvider` to send
 * its calls.
 *
 * The OSS console signs in with a Better Auth cookie and talks to the app
 * directly, so it needs none of this — `useUserAdmin` falls through to
 * `AuthProvider` and nothing changes. Fabric is the case this exists for: it
 * holds a bearer token for the *control plane*, not for the app whose users are
 * on screen, and reaches those users by having the control plane broker
 * `admin:*` to the deployed stage. Same components, same scope gating, a
 * different wire underneath.
 */
export const UserAdminProvider: React.FC<{
  value: UserAdminValue
  children: React.ReactNode
}> = ({ value, children }) => (
  <UserAdminContext.Provider value={value}>
    {children}
  </UserAdminContext.Provider>
)

/**
 * The directory calls, from a `UserAdminProvider` if one is mounted and from
 * `AuthProvider` otherwise.
 *
 * Both contexts are read unconditionally, because hooks must be — the choice
 * between them is made on the values, not by skipping a call. Missing both is
 * an error rather than a degraded render: a menu that silently cannot ban is
 * worse than a component that says it was never wired up.
 */
export const useUserAdmin = (): UserAdminValue => {
  const override = useContext(UserAdminContext)
  const auth = useContext(AuthContext)
  const value = override ?? auth
  if (!value) {
    throw new Error(
      'useUserAdmin must be used within a UserAdminProvider or an AuthProvider'
    )
  }
  return value
}
