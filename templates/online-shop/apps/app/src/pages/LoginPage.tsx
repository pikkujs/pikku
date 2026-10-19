import type { FC } from 'react'
import { Anchor } from '@pikku/mantine/core'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { AuthCard, type AuthFormValues } from '@/components/AuthCard'
import { DevActorSwitcher } from '@/components/DevActorSwitcher'
import { INVALID_CREDENTIALS, signInWithGoogle, signInWithPassword } from '@/lib/auth'

export const LoginPage: FC = () => {
  useLocale()
  const navigate = useNavigate()
  const appName = m.app__name()

  const signIn = useMutation({
    mutationFn: (values: AuthFormValues) =>
      signInWithPassword(values.email, values.password, '/app'),
    onSuccess: () => navigate({ to: '/app' }),
  })
  const google = useMutation({ mutationFn: () => signInWithGoogle('/app') })

  const error = signIn.isError
    ? signIn.error instanceof Error && signIn.error.message === INVALID_CREDENTIALS
      ? m.auth__login__invalid_credentials()
      : m.auth__login__error()
    : google.isError
      ? m.auth__google_error()
      : null

  return (
    <>
      <AuthCard
        appName={appName}
        title={m.auth__login__title()}
        description={m.auth__login__description({ name: appName })}
        cta={m.auth__login__cta()}
        passwordAutoComplete="current-password"
        busy={signIn.isPending}
        googleBusy={google.isPending}
        error={error}
        onAuthSubmit={(values) => signIn.mutate(values)}
        onGoogle={() => google.mutate()}
        secondaryAction={
          <Anchor component={Link} to="/app/forgot-password">
            {m.auth__login__forgot_action()}
          </Anchor>
        }
        footer={
          <>
            {m.auth__login__footer_prompt()}{' '}
            <Anchor component={Link} to="/app/signup">
              {m.auth__login__footer_action()}
            </Anchor>
          </>
        }
      />
      <DevActorSwitcher />
    </>
  )
}
