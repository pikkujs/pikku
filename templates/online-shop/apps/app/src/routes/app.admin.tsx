import { createFileRoute } from '@tanstack/react-router'
import { AdminPage } from '@/pages/AdminPage'

export const Route = createFileRoute('/app/admin')({
  component: AdminPage,
})
