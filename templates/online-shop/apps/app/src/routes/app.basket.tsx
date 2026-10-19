import { createFileRoute } from '@tanstack/react-router'
import { BasketPage } from '@/pages/BasketPage'

export const Route = createFileRoute('/app/basket')({
  component: BasketPage,
})
