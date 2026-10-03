import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { ConsolePanel } from '../shell/ConsolePanel'
import { useUserAdmin } from '../../context/UserAdminContext'

type CreateUserPanelProps = {
  opened: boolean
  onClose: () => void
  onDone: () => void
}

/**
 * Provisions an account directly, bypassing sign-up. The server owns the rules
 * — password bounds, duplicate emails — so this deliberately validates nothing
 * beyond "the required fields are filled in" and surfaces what comes back.
 */
export const CreateUserPanel: React.FC<CreateUserPanelProps> = ({
  opened,
  onClose,
  onDone,
}) => {
  const { createUser, sendSignInLink } = useUserAdmin()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  // The invite. An account with no password cannot be signed into, so the link
  // is the only way in and the box is forced on; once a password is typed it is
  // the admin's choice, defaulted off — a host without the magicLink plugin has
  // no link to send, and must still be able to provision an account.
  const [invite, setInvite] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (opened) {
      setEmail('')
      setName('')
      setPassword('')
      setInvite(false)
      setError(null)
    }
  }, [opened])

  const sendLink = invite || password.length === 0

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      const address = email.trim()
      await createUser({
        email: address,
        ...(password ? { password } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
      })
      // Sent after the account exists, because a link only admits an email that
      // already has a user row. The user is created either way: a failed send
      // refreshes the list and reports itself, so the operator retries the link
      // from the row menu rather than creating the account a second time.
      if (sendLink) {
        try {
          await sendSignInLink(address)
        } catch (e) {
          onDone()
          throw e
        }
      }
      onDone()
      onClose()
    } catch (e) {
      setError((e as Error).message || m.users_action_failed())
    } finally {
      setRunning(false)
    }
  }

  return (
    <ConsolePanel
      opened={opened}
      onClose={onClose}
      title={m.users_create_title()}
      width="sm"
      testId="create-user-panel"
      footer={
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onClose} disabled={running}>
            {m.common_cancel()}
          </Button>
          <Button
            loading={running}
            disabled={email.trim().length === 0}
            onClick={run}
            data-testid="create-user-submit"
          >
            {m.users_create_action()}
          </Button>
        </Group>
      }
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {m.users_create_body()}
        </Text>
        <TextInput
          label={m.users_create_email_label()}
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          data-testid="create-user-email"
        />
        <TextInput
          label={m.users_create_name_label()}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          data-testid="create-user-name"
        />
        <PasswordInput
          label={m.users_create_password_label()}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          data-testid="create-user-password"
        />
        <Checkbox
          label={m.users_create_send_link_label()}
          description={m.users_create_send_link_description()}
          checked={sendLink}
          disabled={password.length === 0}
          onChange={(e) => setInvite(e.currentTarget.checked)}
          data-testid="create-user-send-link"
        />
        {error && (
          <Alert color="red" variant="light">
            <Text size="sm">{asI18n(error)}</Text>
          </Alert>
        )}
      </Stack>
    </ConsolePanel>
  )
}
