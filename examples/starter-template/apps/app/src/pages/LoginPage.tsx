import type { FC } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { AuthCard, type AuthFormValues } from '@/components/AuthCard'
import { DevActorSwitcher } from '@/components/dev/DevActorSwitcher'
import { apiUrl } from '@/lib/env'
import { appSlug } from '@/app-meta'
import { INVALID_CREDENTIALS, signInWithPassword } from '@/lib/auth'

export const LoginPage: FC = () => {
  useLocale()
  const navigate = useNavigate()

  const signIn = useMutation({
    mutationFn: (values: AuthFormValues) => signInWithPassword(values.email, values.password, '/app'),
    onSuccess: () => navigate({ to: '/app' }),
  })

  const error = signIn.isError
    ? signIn.error instanceof Error && signIn.error.message === INVALID_CREDENTIALS
      ? m.auth__login__invalid_credentials()
      : m.auth__login__error()
    : null

  return (
    <>
      <AuthCard
        title={m.auth__login__title()}
        description={m.auth__login__description({ name: m.app__name() })}
        cta={m.auth__login__cta()}
        passwordAutoComplete="current-password"
        busy={signIn.isPending}
        error={error}
        onAuthSubmit={(values) => signIn.mutate(values)}
      />
      <DevActorSwitcher apiUrl={apiUrl()} app={appSlug} onSignedIn={() => navigate({ to: '/app' })} />
    </>
  )
}
