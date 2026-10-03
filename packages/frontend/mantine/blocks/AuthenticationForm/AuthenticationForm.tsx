import {
  Anchor,
  Button,
  Checkbox,
  Divider,
  Group,
  Paper,
  type PaperProps,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@pikku/mantine/core'
import { useForm } from '@mantine/form'
import { useToggle } from '@mantine/hooks'
import { m } from '@/i18n/messages'
import { GoogleButton } from './GoogleButton'
import { TwitterButton } from './TwitterButton'

export function AuthenticationForm(props: PaperProps) {
  const [type, toggle] = useToggle(['login', 'register'])
  const form = useForm({
    initialValues: {
      email: '',
      name: '',
      password: '',
      terms: true,
    },

    validate: {
      email: (val) => (/^\S+@\S+$/.test(val) ? null : m.authenticationform__invalid_email()),
      password: (val) => (val.length <= 6 ? m.authenticationform__password_too_short() : null),
    },
  })

  return (
    <Paper radius="md" p="lg" withBorder {...props}>
      <Text size="lg" fw={500} c="bright">
        {type === 'register'
          ? m.authenticationform__welcome_register()
          : m.authenticationform__welcome_login()}
      </Text>

      <Group grow mb="md" mt="md">
        <GoogleButton radius="xl">{m.authenticationform__google()}</GoogleButton>
        <TwitterButton radius="xl">{m.authenticationform__twitter()}</TwitterButton>
      </Group>

      <Divider
        label={m.authenticationform__or_continue()}
        labelPosition="center"
        my="lg"
        styles={{ label: { color: 'var(--mantine-color-bright)', opacity: 0.85 } }}
      />

      <form onSubmit={form.onSubmit(() => {})}>
        <Stack>
          {type === 'register' && (
            <TextInput
              label={m.authenticationform__name()}
              placeholder={m.authenticationform__name_placeholder()}
              value={form.values.name}
              onChange={(event) => form.setFieldValue('name', event.currentTarget.value)}
              radius="md"
            />
          )}

          <TextInput
            required
            label={m.authenticationform__email()}
            placeholder={m.authenticationform__email_placeholder()}
            value={form.values.email}
            onChange={(event) => form.setFieldValue('email', event.currentTarget.value)}
            error={form.errors.email && m.authenticationform__invalid_email()}
            radius="md"
          />

          <PasswordInput
            required
            label={m.authenticationform__password()}
            placeholder={m.authenticationform__password_placeholder()}
            value={form.values.password}
            onChange={(event) => form.setFieldValue('password', event.currentTarget.value)}
            error={form.errors.password && m.authenticationform__password_too_short()}
            radius="md"
          />

          {type === 'register' && (
            <Checkbox
              label={m.authenticationform__terms()}
              checked={form.values.terms}
              onChange={(event) => form.setFieldValue('terms', event.currentTarget.checked)}
            />
          )}
        </Stack>

        <Group justify="space-between" mt="xl">
          <Anchor
            component="button"
            type="button"
            c="bright"
            opacity={0.85}
            onClick={() => toggle()}
            size="xs"
          >
            {type === 'register'
              ? m.authenticationform__toggle_to_login()
              : m.authenticationform__toggle_to_register()}
          </Anchor>
          <Button type="submit" radius="xl">
            {type === 'register' ? m.authenticationform__register() : m.authenticationform__login()}
          </Button>
        </Group>
      </form>
    </Paper>
  )
}
