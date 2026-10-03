import type { FC } from 'react'
import type { I18nString } from '@pikku/react'
import { Anchor, Button, Stack, Text, TextInput } from '@pikku/mantine/core'
import { Link } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { AuthShell } from '@/components/AuthShell'
import { requestPasswordReset } from '@/lib/auth'

const validEmail = (value: string): I18nString | undefined => {
  if (!value.trim()) return m.validation__required()
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? undefined : m.validation__email_invalid()
}

export const ForgotPasswordPage: FC = () => {
  useLocale()
  const appName = m.app__name()

  const request = useMutation({ mutationFn: (email: string) => requestPasswordReset(email) })

  const form = useForm({
    defaultValues: { email: '' },
    onSubmit: ({ value }) => request.mutate(value.email),
  })

  const footer = (
    <>
      {m.auth__forgot__footer_prompt()}{' '}
      <Anchor component={Link} to="/app/auth/login">
        {m.auth__forgot__footer_action()}
      </Anchor>
    </>
  )

  // Deliberately the same confirmation whether or not the address has an account:
  // telling an anonymous caller which emails are registered is account enumeration.
  if (request.isSuccess) {
    return (
      <AuthShell
        appName={appName}
        title={m.auth__forgot__sent_title()}
        description={m.auth__forgot__sent_description({ email: request.variables })}
        footer={footer}
      >
        <Button component={Link} to="/app/auth/login" variant="default" fullWidth>
          {m.auth__forgot__footer_action()}
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      appName={appName}
      title={m.auth__forgot__title()}
      description={m.auth__forgot__description()}
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
          <form.Field name="email" validators={{ onChange: ({ value }) => validEmail(value) }}>
            {(field) => (
              <TextInput
                label={m.common__email()}
                placeholder={m.common__email_placeholder()}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.currentTarget.value)}
                onBlur={field.handleBlur}
                error={field.state.meta.errors[0] as I18nString | undefined}
                type="email"
                autoComplete="email"
              />
            )}
          </form.Field>

          {request.isError ? (
            <Text c="red" size="sm">
              {m.auth__forgot__error()}
            </Text>
          ) : null}

          <Button type="submit" loading={request.isPending} fullWidth>
            {m.auth__forgot__cta()}
          </Button>
        </Stack>
      </form>
    </AuthShell>
  )
}
