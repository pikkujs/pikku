import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Group,
  Drawer,
  PasswordInput,
  Stack,
  Text,
  Textarea,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useAuth, type AuthUser } from '../../context/AuthContext'
import type { UserAction } from './user-actions'

type UserActionDrawerProps = {
  action: UserAction | null
  user: AuthUser | null
  onClose: () => void
  onDone: () => void
}

/**
 * Confirms and performs one destructive user-management action. The copy and
 * the extra field vary by action; the shape — confirm, run, report — does not,
 * which is why these are one component rather than four near-identical ones.
 */
export const UserActionDrawer: React.FC<UserActionDrawerProps> = ({
  action,
  user,
  onClose,
  onDone,
}) => {
  const { setUserBanned, removeUser, revokeUserSessions, setUserPassword } =
    useAuth()
  const [reason, setReason] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (action) {
      setReason('')
      setPassword('')
      setError(null)
    }
  }, [action, user?.id])

  const email = user?.email ?? ''

  const run = async () => {
    if (!user) return
    setRunning(true)
    setError(null)
    try {
      if (action === 'ban') {
        await setUserBanned({
          userId: user.id,
          banned: true,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        })
      } else if (action === 'remove') {
        await removeUser(user.id)
      } else if (action === 'revoke') {
        await revokeUserSessions(user.id)
      } else if (action === 'password') {
        await setUserPassword(user.id, password)
      }
      onDone()
      onClose()
    } catch (e) {
      setError((e as Error).message || m.users_action_failed())
    } finally {
      setRunning(false)
    }
  }

  const title =
    action === 'ban'
      ? m.users_ban_confirm_title()
      : action === 'remove'
        ? m.users_remove_confirm_title()
        : action === 'revoke'
          ? m.users_revoke_confirm_title()
          : m.users_set_password_title()

  const body =
    action === 'ban'
      ? m.users_ban_confirm_body({ email })
      : action === 'remove'
        ? m.users_remove_confirm_body({ email })
        : action === 'revoke'
          ? m.users_revoke_confirm_body({ email })
          : m.users_set_password_body({ email })

  const confirmLabel =
    action === 'ban'
      ? m.users_ban_action()
      : action === 'remove'
        ? m.users_remove_action()
        : action === 'revoke'
          ? m.users_revoke_sessions_action()
          : m.users_set_password_action()

  return (
    <Drawer
      opened={action !== null && user !== null}
      onClose={onClose}
      position="right"
      size={420}
      title={title}
    >
      <Stack gap="md">
        <Text size="sm">{body}</Text>
        {action === 'ban' && (
          <Textarea
            label={m.users_ban_reason_label()}
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            autosize
            minRows={2}
          />
        )}
        {action === 'password' && (
          <PasswordInput
            label={m.users_set_password_label()}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
        )}
        {error && (
          <Alert color="red" variant="light">
            <Text size="sm">{asI18n(error)}</Text>
          </Alert>
        )}
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose} disabled={running}>
            {m.common_cancel()}
          </Button>
          <Button
            color={action === 'password' ? undefined : 'red'}
            loading={running}
            disabled={action === 'password' && password.length === 0}
            onClick={run}
          >
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Drawer>
  )
}
