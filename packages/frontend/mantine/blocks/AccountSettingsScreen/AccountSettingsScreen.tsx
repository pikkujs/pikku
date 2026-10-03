import { useState } from 'react'
import {
  Alert,
  Button,
  Container,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  Title,
} from '@pikku/mantine/core'
import { useMutation, useQuery } from '@tanstack/react-query'
import { m } from '@/i18n/messages'
import { asI18n } from '@pikku/react'
import { changePassword, getAuthSession, signOut } from '@/lib/auth'

// A complete account-settings screen: the signed-in user's identity, a
// change-password form, and a sign-out button — all wired to src/lib/auth. Use
// as the body of an /app/account route. onSignedOut lets the route redirect out.
export function AccountSettingsScreen({ onSignedOut }: { onSignedOut?: () => void }) {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: getAuthSession })
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')

  const change = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: () => {
      setCurrent('')
      setNext('')
    },
  })
  const out = useMutation({ mutationFn: () => signOut(), onSuccess: () => onSignedOut?.() })

  const user = session.data?.user

  return (
    <Container size="sm" py="xl">
      <Stack gap="xl">
        <Title order={2}>{m.accountsettingsscreen__title()}</Title>

        <Paper withBorder p="lg" radius="md">
          <Stack gap={4}>
            <Text fw={600}>{m.accountsettingsscreen__profile()}</Text>
            <Text size="sm">{asI18n(user?.name || m.accountsettingsscreen__no_name())}</Text>
            <Text size="sm" c="dimmed">
              {asI18n(user?.email || '')}
            </Text>
          </Stack>
        </Paper>

        <Paper withBorder p="lg" radius="md">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              change.mutate()
            }}
          >
            <Stack gap="md">
              <Text fw={600}>{m.accountsettingsscreen__password()}</Text>
              <PasswordInput
                required
                label={m.accountsettingsscreen__current()}
                value={current}
                onChange={(e) => setCurrent(e.currentTarget.value)}
              />
              <PasswordInput
                required
                label={m.accountsettingsscreen__new()}
                value={next}
                onChange={(e) => setNext(e.currentTarget.value)}
              />
              {change.isError && (
                <Alert color="red" variant="light">
                  {asI18n(change.error.message)}
                </Alert>
              )}
              {change.isSuccess && (
                <Alert color="green" variant="light">
                  {m.accountsettingsscreen__password_updated()}
                </Alert>
              )}
              <Group justify="flex-end">
                <Button type="submit" loading={change.isPending}>
                  {m.accountsettingsscreen__update()}
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>

        <Group justify="flex-end">
          <Button variant="default" loading={out.isPending} onClick={() => out.mutate()}>
            {m.accountsettingsscreen__sign_out()}
          </Button>
        </Group>
        {out.isError && (
          <Alert color="red" variant="light">
            {asI18n(out.error.message)}
          </Alert>
        )}
      </Stack>
    </Container>
  )
}
