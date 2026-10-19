import { createFileRoute } from '@tanstack/react-router'
import { OrderPage } from '@/pages/OrderPage'

export const Route = createFileRoute('/app/orders/$orderId')({
  component: function OrderRoute() {
    const { orderId } = Route.useParams()
    return <OrderPage orderId={orderId} />
  },
})
