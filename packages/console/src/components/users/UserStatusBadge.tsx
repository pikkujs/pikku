import { Badge } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import type { AuthUser } from '../../context/AuthContext'

type UserStatusBadgeProps = { user: AuthUser }

/**
 * Ban state for one user. Renders nothing when `banned` is undefined — the host
 * has no `admin()` plugin, so claiming the user is "active" would be inventing
 * a status the server never reported.
 */
export const UserStatusBadge: React.FC<UserStatusBadgeProps> = ({ user }) => {
  if (user.banned === undefined) {
    return null
  }
  return user.banned ? (
    <Badge color="red" variant="light" size="sm">
      {m.users_status_banned()}
    </Badge>
  ) : (
    <Badge color="gray" variant="light" size="sm">
      {m.users_status_active()}
    </Badge>
  )
}
