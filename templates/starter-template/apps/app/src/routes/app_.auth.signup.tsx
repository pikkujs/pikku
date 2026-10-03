import { createFileRoute } from '@tanstack/react-router'
import { SignupPage } from '@/pages/SignupPage'
import { redirectIfAuthenticated } from '@/lib/auth-gate'

export const Route = createFileRoute('/app_/auth/signup')({
  beforeLoad: redirectIfAuthenticated,
  component: SignupPage,
})
