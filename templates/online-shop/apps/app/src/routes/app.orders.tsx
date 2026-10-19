import { createFileRoute } from '@tanstack/react-router'
import { OrdersPage } from '@/pages/OrdersPage'

/**
 * `?placed=true` is set by the basket on a successful checkout, so the receipt
 * can say so once. It lives in the URL rather than in memory because a reload
 * of a confirmation page should not silently lose the confirmation.
 */
export const Route = createFileRoute('/app/orders')({
  validateSearch: (search: Record<string, unknown>) => ({
    placed: search.placed === true || search.placed === 'true',
  }),
  component: function OrdersRoute() {
    const { placed } = Route.useSearch()
    return <OrdersPage justPlaced={placed} />
  },
})
