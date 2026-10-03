import { useAuth } from '../../context/AuthContext'
import { LoginScreen } from './LoginScreen'
import { NotAuthorized } from './NotAuthorized'
import { ConsoleLoading } from '../ui/ConsoleLoading'

/**
 * The console's front door. Blocks all app UI until there is a Better Auth
 * session whose user holds `pikku:console` — the root `@pikku/addon-console` is
 * itself wired to require, and by pikku's parent-grant rule the umbrella over
 * every `pikku:console:*` capability. No session → login; signed in but without
 * the scope → not-authorized. Wrap the authenticated route group with it.
 *
 * Deliberately not `admin`: that tree belongs to `@pikku/addon-admin` now, and
 * whether someone administers the application is a separate question from
 * whether they may open the console.
 */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { loading, user, canUseConsole } = useAuth()

  if (loading) {
    return <ConsoleLoading h="100vh" />
  }

  if (!user) {
    return <LoginScreen />
  }

  if (!canUseConsole) {
    return <NotAuthorized />
  }

  return <>{children}</>
}
