import type { FC } from 'react'
import type { I18nNode, I18nString } from '@pikku/react'
import { useForm } from '@tanstack/react-form'
import { Button, Divider, PasswordInput, Stack, Text, TextInput } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { AuthShell } from './AuthShell'

export type AuthFormValues = { name: string; email: string; password: string }

type AuthCardProps = {
  appName: I18nString
  title: I18nString
  description: I18nString
  cta: I18nString
  // Show the Name field (signup) above email.
  includeName?: boolean
  passwordAutoComplete: 'current-password' | 'new-password'
  // Server-side error from the page's mutation (bad credentials, email in use…).
  error: I18nString | null
  googleBusy: boolean
  // Submitting state of the page's mutation; drives the primary button spinner.
  busy: boolean
  footer: I18nNode
  // Optional link under the submit button — the login page's "Forgot your password?".
  secondaryAction?: I18nNode
  // Called with validated values once the TanStack form passes validation.
  onAuthSubmit: (values: AuthFormValues) => void
  onGoogle: () => void
}

const ArrowGlyph = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
)

const GoogleGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.1a6.6 6.6 0 0 1 0-4.22V7.04H2.18a11 11 0 0 0 0 9.92l3.66-2.86Z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38Z"
    />
  </svg>
)

const required = (value: string): I18nString | undefined =>
  value.trim() ? undefined : m.validation__required()

const validEmail = (value: string): I18nString | undefined => {
  if (!value.trim()) return m.validation__required()
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? undefined : m.validation__email_invalid()
}

export const AuthCard: FC<AuthCardProps> = (props) => {
  useLocale()

  const form = useForm({
    defaultValues: { name: '', email: '', password: '' } as AuthFormValues,
    onSubmit: ({ value }) => props.onAuthSubmit(value),
  })

  return (
    <AuthShell
      appName={props.appName}
      title={props.title}
      description={props.description}
      footer={props.footer}
    >
      <>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
        >
          <Stack gap="sm">
            {props.includeName ? (
              <form.Field name="name" validators={{ onChange: ({ value }) => required(value) }}>
                {(field) => (
                  <TextInput
                    label={m.common__name()}
                    placeholder={m.common__name_placeholder()}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.currentTarget.value)}
                    onBlur={field.handleBlur}
                    error={field.state.meta.errors[0] as I18nString | undefined}
                    autoComplete="name"
                  />
                )}
              </form.Field>
            ) : null}

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

            <form.Field name="password" validators={{ onChange: ({ value }) => required(value) }}>
              {(field) => (
                <PasswordInput
                  label={m.common__password()}
                  placeholder={m.common__password_placeholder()}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                  onBlur={field.handleBlur}
                  error={field.state.meta.errors[0] as I18nString | undefined}
                  autoComplete={props.passwordAutoComplete}
                />
              )}
            </form.Field>

            {props.error ? (
              <Text c="red" size="sm">
                {props.error}
              </Text>
            ) : null}

            <Button type="submit" loading={props.busy} fullWidth rightSection={<ArrowGlyph />}>
              {props.cta}
            </Button>

            {props.secondaryAction ? (
              <Text ta="center" size="sm" c="dimmed">
                {props.secondaryAction}
              </Text>
            ) : null}
          </Stack>
        </form>

        <Divider label={m.auth__or()} labelPosition="center" />

        <Button
          variant="default"
          fullWidth
          loading={props.googleBusy}
          leftSection={<GoogleGlyph />}
          onClick={props.onGoogle}
        >
          {m.auth__continue_with_google()}
        </Button>
      </>
    </AuthShell>
  )
}
