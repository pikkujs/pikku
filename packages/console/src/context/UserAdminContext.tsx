import { createContext, useContext } from 'react'
import { AuthContext, type AuthContextValue } from './AuthContext'

/** The calls the user-directory UI needs, and the scope check that gates them. */
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

/** Points the directory UI at somewhere other than `AuthProvider`. */
export const UserAdminProvider: React.FC<{
  value: UserAdminValue
  children: React.ReactNode
}> = ({ value, children }) => (
  <UserAdminContext.Provider value={value}>
    {children}
  </UserAdminContext.Provider>
)

/** The directory calls, from a `UserAdminProvider` if mounted, else `AuthProvider`. */
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
