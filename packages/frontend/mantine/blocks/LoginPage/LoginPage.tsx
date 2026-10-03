import { useState } from 'react'
import {
  Alert,
  Anchor,
  Button,
  Center,
  Divider,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@pikku/mantine/core'
import { useMutation } from '@tanstack/react-query'
import { m } from '@/i18n/messages'
import { asI18n } from '@pikku/react'
import { Wordmark } from '@/components/Wordmark'
// Dev-only "Sign in as…" persona switcher — one click signs in as a seeded scenario
// persona (floats, renders null in production / when no actors are exposed).
import { DevActorSwitcher } from '@/components/DevActorSwitcher'
import {
  EMAIL_IN_USE,
  INVALID_CREDENTIALS,
  registerWithPassword,
  signInWithGoogle,
  signInWithPassword,
} from '@/lib/auth'

// A full-page, Better Auth-wired sign-in / register screen: email + password wired
// to signInWithPassword / registerWithPassword, a Google button, and the dev-only
// "Sign in as…" persona switcher (renders only under `vite dev`). All async goes
// through useMutation so errors render inline — never a toast. onAuthed lets the
// route redirect in.
export function LoginPage({ onAuthed }: { onAuthed?: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submit = useMutation({
    mutationFn: async () => {
      if (mode === 'register') await registerWithPassword(email, password)
      else await signInWithPassword(email, password)
    },
    onSuccess: () => onAuthed?.(),
  })
  const google = useMutation({ mutationFn: () => signInWithGoogle() })

  const errorText = (() => {
    const msg = submit.error?.message
    if (msg === INVALID_CREDENTIALS) return m.loginpage__error_invalid()
    if (msg === EMAIL_IN_USE) return m.loginpage__error_email_in_use()
    return msg ? asI18n(msg) : null
  })()

  return (
    <Center mih="100vh" p="md">
      <Stack w="100%" maw={400} gap="lg">
        <Center>
          <Wordmark name={m.app__name()} />
        </Center>
        <Paper withBorder p="xl" radius="md">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit.mutate()
            }}
          >
            <Stack gap="md">
              <Title order={3}>
                {mode === 'login' ? m.loginpage__title_login() : m.loginpage__title_register()}
              </Title>
              <Button
                variant="default"
                fullWidth
                loading={google.isPending}
                onClick={() => google.mutate()}
              >
                {m.loginpage__google()}
              </Button>
              {google.isError && (
                <Alert color="red" variant="light">
                  {asI18n(google.error.message)}
                </Alert>
              )}
              <Divider label={m.loginpage__or()} labelPosition="center" />
              <TextInput
                required
                type="email"
                label={m.loginpage__email()}
                placeholder={m.loginpage__email_placeholder()}
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
              />
              <PasswordInput
                required
                label={m.loginpage__password()}
                placeholder={m.loginpage__password_placeholder()}
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
              />
              {errorText && (
                <Alert color="red" variant="light">
                  {errorText}
                </Alert>
              )}
              <Button type="submit" fullWidth loading={submit.isPending}>
                {mode === 'login' ? m.loginpage__sign_in() : m.loginpage__create_account()}
              </Button>
              <Text size="sm" c="dimmed" ta="center">
                <Anchor
                  component="button"
                  type="button"
                  size="sm"
                  onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                >
                  {mode === 'login' ? m.loginpage__toggle_register() : m.loginpage__toggle_login()}
                </Anchor>
              </Text>
            </Stack>
          </form>
        </Paper>
        <DevActorSwitcher />
      </Stack>
    </Center>
  )
}
