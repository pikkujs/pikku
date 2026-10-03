import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@/components/AppShell'

export const Route = createFileRoute('/app')({
  ssr: false,
  component: AppShell,
})
