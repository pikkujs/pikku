import { ActionIcon, Menu } from '@pikku/mantine/core'
import {
  Ban,
  KeyRound,
  LogOut,
  MoreHorizontal,
  Trash2,
  Undo2,
} from 'lucide-react'
import { m } from '@/i18n/messages'
import { useAuth, type AuthUser } from '../../context/AuthContext'
import { USER_ACTION_SCOPE, type UserAction } from './user-actions'

type UserActionsMenuProps = {
  user: AuthUser
  onAction: (action: UserAction) => void
  onUnbanned: () => void
}

/**
 * Per-user overflow menu. Every item is hidden unless the caller holds the
 * scope the underlying function is gated on, so an operator granted only
 * `admin:users:list` sees no menu at all.
 */
export const UserActionsMenu: React.FC<UserActionsMenuProps> = ({
  user,
  onAction,
  onUnbanned,
}) => {
  const { can, setUserBanned } = useAuth()
  const canBan = can(USER_ACTION_SCOPE.ban)
  const canRevoke = can(USER_ACTION_SCOPE.revoke)
  const canPassword = can(USER_ACTION_SCOPE.password)
  const canRemove = can(USER_ACTION_SCOPE.remove)

  if (!canBan && !canRevoke && !canPassword && !canRemove) {
    return null
  }

  const unban = async () => {
    await setUserBanned({ userId: user.id, banned: false })
    onUnbanned()
  }

  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={m.users_more_actions()}
        >
          <MoreHorizontal size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {canBan &&
          (user.banned ? (
            <Menu.Item leftSection={<Undo2 size={14} />} onClick={unban}>
              {m.users_unban_action()}
            </Menu.Item>
          ) : (
            <Menu.Item
              leftSection={<Ban size={14} />}
              onClick={() => onAction('ban')}
            >
              {m.users_ban_action()}
            </Menu.Item>
          ))}
        {canRevoke && (
          <Menu.Item
            leftSection={<LogOut size={14} />}
            onClick={() => onAction('revoke')}
          >
            {m.users_revoke_sessions_action()}
          </Menu.Item>
        )}
        {canPassword && (
          <Menu.Item
            leftSection={<KeyRound size={14} />}
            onClick={() => onAction('password')}
          >
            {m.users_set_password_action()}
          </Menu.Item>
        )}
        {canRemove && (
          <>
            <Menu.Divider />
            <Menu.Item
              color="red"
              leftSection={<Trash2 size={14} />}
              onClick={() => onAction('remove')}
            >
              {m.users_remove_action()}
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  )
}
