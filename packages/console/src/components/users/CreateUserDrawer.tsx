import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Drawer,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useAuth } from '../../context/AuthContext'

type CreateUserDrawerProps = {
  opened: boolean
  onClose: () => void
  onDone: () => void
}

/**
 * Provisions an account directly, bypassing sign-up. The server owns the rules
 * — password bounds, duplicate emails — so this deliberately validates nothing
 * beyond "the required fields are filled in" and surfaces what comes back.
 */
export const CreateUserDrawer: React.FC<CreateUserDrawerProps> = ({
  opened,
  onClose,
  onDone,
}) => {
  const { createUser } = useAuth()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (opened) {
      setEmail('')
      setName('')
      setPassword('')
      setError(null)
    }
  }, [opened])

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      await createUser({
        email: email.trim(),
        password,
        ...(name.trim() ? { name: name.trim() } : {}),
      })
      onDone()
      onClose()
    } catch (e) {
      setError((e as Error).message || m.users_action_failed())
    } finally {
      setRunning(false)
    }
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={420}
      title={m.users_create_title()}
    >
      <Stack gap="md">
        <Text size="sm">{m.users_create_body()}</Text>
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
            loading={running}
            disabled={email.trim().length === 0 || password.length === 0}
            onClick={run}
            data-testid="create-user-submit"
          >
            {m.users_create_action()}
          </Button>
        </Group>
      </Stack>
    </Drawer>
  )
}
