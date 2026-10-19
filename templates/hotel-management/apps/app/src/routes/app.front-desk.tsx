import { createFileRoute } from '@tanstack/react-router'
import { FrontDeskPage } from '@/pages/FrontDeskPage'

export const Route = createFileRoute('/app/front-desk')({
  component: FrontDeskPage,
})
