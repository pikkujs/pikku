import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@/components/AppShell'
import { useRequireAuthentication } from '@/hooks/useAuthGate'

export const Route = createFileRoute('/app')({
  component: AppLayout,
})

function AppLayout() {
  useRequireAuthentication()
  return <AppShell />
}
