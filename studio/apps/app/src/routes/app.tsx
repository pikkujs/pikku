import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@/components/AppShell'
import { requireAuthentication } from '@/lib/auth-gate'

export const Route = createFileRoute('/app')({
  beforeLoad: requireAuthentication,
  component: AppShell,
})
