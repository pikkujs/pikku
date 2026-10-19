import { createFileRoute } from '@tanstack/react-router'
import { SignupPage } from '@/pages/SignupPage'
import { useRedirectIfAuthenticated } from '@/hooks/useAuthGate'

export const Route = createFileRoute('/app_/signup')({
  component: SignupRoute,
})

function SignupRoute() {
  useRedirectIfAuthenticated()
  return <SignupPage />
}
