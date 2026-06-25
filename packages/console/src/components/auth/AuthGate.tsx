import { Center, Loader } from '@pikku/mantine/core'
import { useAuth } from '../../context/AuthContext'
import { LoginScreen } from './LoginScreen'
import { NotAuthorized } from './NotAuthorized'

/**
 * Admin-only gate for the console. Blocks all app UI until there is a Better
 * Auth session whose user has `role: 'admin'`. No session → login; signed in
 * but not an admin → not-authorized. Wrap the authenticated route group with it.
 */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { loading, user, isAdmin, impersonatedBy } = useAuth()

  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  if (!user) {
    return <LoginScreen />
  }

  // An impersonation session is admin-authorized by construction (only an admin
  // can create one), so let it through even though the impersonated user may not
  // be an admin — otherwise impersonating a normal user would lock the console.
  if (!isAdmin && !impersonatedBy) {
    return <NotAuthorized />
  }

  return <>{children}</>
}
