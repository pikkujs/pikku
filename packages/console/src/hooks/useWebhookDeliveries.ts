import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'

// Dates arrive JSON-serialized (strings) over the RPC boundary.
export interface WebhookDelivery {
  deliveryId: string
  organizationId: string | null
  url: string
  event: string | null
  status: 'pending' | 'delivered' | 'failed'
  attempts: number
  createdAt: string
  updatedAt: string
  deliveredAt: string | null
}

export interface WebhookAttempt {
  attemptId: string
  deliveryId: string
  attemptNumber: number
  statusCode: number | null
  responseBody: string | null
  error: string | null
  createdAt: string
}

export const useWebhookDeliveries = () => {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: ['webhook-deliveries'],
    queryFn: async () =>
      (await rpc.invoke(
        'console:listWebhookDeliveries',
        {}
      )) as unknown as WebhookDelivery[],
  })
}

export const useWebhookDelivery = (deliveryId: string | null) => {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: ['webhook-delivery', deliveryId],
    enabled: !!deliveryId,
    queryFn: async () =>
      (await rpc.invoke('console:getWebhookDelivery', {
        deliveryId: deliveryId!,
      })) as unknown as {
        delivery: WebhookDelivery
        attempts: WebhookAttempt[]
      } | null,
  })
}
