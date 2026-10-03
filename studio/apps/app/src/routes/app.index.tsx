import { createFileRoute } from '@tanstack/react-router'
import { NewProjectScreen } from '@/screens/NewProjectScreen'

export const Route = createFileRoute('/app/')({
  component: NewProjectScreen,
})
