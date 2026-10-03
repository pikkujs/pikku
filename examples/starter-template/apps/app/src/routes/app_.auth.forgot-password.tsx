import { createFileRoute } from '@tanstack/react-router'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { redirectIfAuthenticated } from '@/lib/auth-gate'

export const Route = createFileRoute('/app_/auth/forgot-password')({
  beforeLoad: redirectIfAuthenticated,
  component: ForgotPasswordPage,
})
