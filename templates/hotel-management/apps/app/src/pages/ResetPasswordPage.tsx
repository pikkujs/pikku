import type { FC } from 'react'
import type { I18nString } from '@pikku/react'
import { Anchor, Button, PasswordInput, Stack, Text } from '@pikku/mantine/core'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { AuthShell } from '@/components/AuthShell'
import { RESET_TOKEN_INVALID, resetPassword } from '@/lib/auth'

const MIN_PASSWORD = 8

export const ResetPasswordPage: FC = () => {
  useLocale()
  const navigate = useNavigate()
  const appName = m.app__name()
  // Better Auth appends ?token=… to the redirectTo we handed it in the email.
  // The route ID, not the URL: a non-nested route file (app_.reset-password.tsx)
  // keeps its underscore in the ID while serving /app/reset-password.
  const { token } = useSearch({ from: '/app_/reset-password' })

  const reset = useMutation({
    mutationFn: (values: { password: string; confirm: string }) =>
      resetPassword(values.password, token ?? ''),
    // The reset does not mint a session and the token carries no email we could
    // sign in with, so hand them to /login with the new password in hand.
    onSuccess: () => navigate({ to: '/app/login' }),
  })

  const form = useForm({
    defaultValues: { password: '', confirm: '' },
    onSubmit: ({ value }) => reset.mutate(value),
  })

  const footer = (
    <>
      {m.auth__reset__footer_prompt()}{' '}
      <Anchor component={Link} to="/app/login">
        {m.auth__reset__footer_action()}
      </Anchor>
    </>
  )

  // A bare /reset-password with no token is a dead end — say so and route them
  // back to requesting a fresh link instead of failing on submit.
  if (!token) {
    return (
      <AuthShell
        appName={appName}
        title={m.auth__reset__title()}
        description={m.auth__reset__missing_token()}
        footer={footer}
      >
        <Button component={Link} to="/app/forgot-password" fullWidth>
          {m.auth__forgot__cta()}
        </Button>
      </AuthShell>
    )
  }

  const error = reset.isError
    ? reset.error instanceof Error && reset.error.message === RESET_TOKEN_INVALID
      ? m.auth__reset__invalid_token()
      : m.auth__reset__error()
    : null

  return (
    <AuthShell
      appName={appName}
      title={m.auth__reset__title()}
      description={m.auth__reset__description({ name: appName })}
      footer={footer}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        <Stack gap="sm">
          <form.Field
            name="password"
            validators={{
              onChange: ({ value }): I18nString | undefined =>
                value.length >= MIN_PASSWORD ? undefined : m.auth__reset__too_short(),
            }}
          >
            {(field) => (
              <PasswordInput
                label={m.auth__reset__password_label()}
                placeholder={m.common__password_placeholder()}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.currentTarget.value)}
                onBlur={field.handleBlur}
                error={field.state.meta.errors[0] as I18nString | undefined}
                autoComplete="new-password"
              />
            )}
          </form.Field>

          <form.Subscribe selector={(state) => state.values.password}>
            {(password) => (
              <form.Field
                name="confirm"
                validators={{
                  onChange: ({ value }): I18nString | undefined =>
                    value === password ? undefined : m.auth__reset__mismatch(),
                }}
              >
                {(field) => (
                  <PasswordInput
                    label={m.auth__reset__confirm_label()}
                    placeholder={m.common__password_placeholder()}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                    onBlur={field.handleBlur}
                    error={field.state.meta.errors[0] as I18nString | undefined}
                    autoComplete="new-password"
                  />
                )}
              </form.Field>
            )}
          </form.Subscribe>

          {error ? (
            <Text c="red" size="sm">
              {error}
            </Text>
          ) : null}

          {reset.isSuccess ? (
            <Text c="dimmed" size="sm">
              {m.auth__reset__success()}
            </Text>
          ) : null}

          <Button type="submit" loading={reset.isPending} fullWidth>
            {m.auth__reset__cta()}
          </Button>
        </Stack>
      </form>
    </AuthShell>
  )
}
