import { createFileRoute } from '@tanstack/react-router'
import { LoginPage } from '@/pages/LoginPage'
import { useRedirectIfAuthenticated } from '@/hooks/useAuthGate'

export const Route = createFileRoute('/app_/login')({
  component: LoginRoute,
})

function LoginRoute() {
  useRedirectIfAuthenticated()
  return <LoginPage />
}
