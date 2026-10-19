import type { FC } from 'react'
import { Anchor } from '@pikku/mantine/core'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { AuthCard, type AuthFormValues } from '@/components/AuthCard'
import { EMAIL_IN_USE, registerWithPassword, signInWithGoogle } from '@/lib/auth'
import { useAnalytics } from '@/hooks/useAnalytics'

export const SignupPage: FC = () => {
  useLocale()
  const navigate = useNavigate()
  const analytics = useAnalytics()
  const appName = m.app__name()

  const signUp = useMutation({
    mutationFn: (values: AuthFormValues) =>
      registerWithPassword(values.email, values.password, {
        name: values.name,
        redirectPath: '/app',
      }),
    // The outcome event fires from `onSuccess`, where the account actually
    // exists — not from the submit handler, which also runs for every failed
    // attempt. This is the pattern the event registry asks for.
    onSuccess: () => {
      analytics.event('signed_up', {})
      navigate({ to: '/app' })
    },
  })
  const google = useMutation({ mutationFn: () => signInWithGoogle('/app') })

  const error = signUp.isError
    ? signUp.error instanceof Error && signUp.error.message === EMAIL_IN_USE
      ? m.auth__signup__email_in_use()
      : m.auth__signup__error()
    : google.isError
      ? m.auth__google_error()
      : null

  return (
    <AuthCard
      appName={appName}
      title={m.auth__signup__title()}
      description={m.auth__signup__description({ name: appName })}
      cta={m.auth__signup__cta()}
      includeName
      passwordAutoComplete="new-password"
      busy={signUp.isPending}
      googleBusy={google.isPending}
      error={error}
      onAuthSubmit={(values) => signUp.mutate(values)}
      onGoogle={() => google.mutate()}
      footer={
        <>
          {m.auth__signup__footer_prompt()}{' '}
          <Anchor component={Link} to="/app/login">
            {m.auth__signup__footer_action()}
          </Anchor>
        </>
      }
    />
  )
}
