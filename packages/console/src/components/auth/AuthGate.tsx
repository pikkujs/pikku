import { Center, Loader } from '@pikku/mantine/core'
import { useAuth } from '../../context/AuthContext'
import { LoginScreen } from './LoginScreen'
import { NotAuthorized } from './NotAuthorized'

/**
 * Admin-only gate for the console. Blocks all app UI until there is a Better
 * Auth session whose user holds the `admin` scope — pikku's parent-grant rule
 * makes that the umbrella over every `admin:*` capability the console exposes.
 * No session → login; signed in but without the scope → not-authorized. Wrap
 * the authenticated route group with it.
 */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { loading, user, isAdmin } = useAuth()

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

  if (!isAdmin) {
    return <NotAuthorized />
  }

  return <>{children}</>
}
