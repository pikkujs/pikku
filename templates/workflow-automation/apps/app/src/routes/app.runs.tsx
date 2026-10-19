import { createFileRoute } from '@tanstack/react-router'
import { RunsPage } from '@/pages/RunsPage'

export const Route = createFileRoute('/app/runs')({
  component: RunsPage,
})
