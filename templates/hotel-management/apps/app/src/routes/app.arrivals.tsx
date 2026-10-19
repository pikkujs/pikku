import { createFileRoute } from '@tanstack/react-router'
import { ArrivalsPage } from '@/pages/ArrivalsPage'

export const Route = createFileRoute('/app/arrivals')({
  component: ArrivalsPage,
})
