import { createFileRoute } from '@tanstack/react-router'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'

export const Route = createFileRoute('/app_/reset-password')({
  // The emailed link lands here as /app/reset-password?token=… — anything else is a
  // token-less visit, which the page handles by pointing back at /app/forgot-password.
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: ResetPasswordRoute,
})

function ResetPasswordRoute() {
  return <ResetPasswordPage />
}
