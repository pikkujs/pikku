import { createFileRoute } from '@tanstack/react-router'
import { CataloguePage } from '@/pages/CataloguePage'

export const Route = createFileRoute('/app/catalogue')({
  component: CataloguePage,
})
