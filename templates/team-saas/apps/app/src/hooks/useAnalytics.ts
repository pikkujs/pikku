import { recordEvent } from '@/lib/analytics'

/**
 * Access to the analytics client.
 *
 * A hook for ergonomics only — it is not a data-fetching hook and has no
 * loading or error state to consume.
 *
 *   const analytics = useAnalytics()
 *
 *   const mutation = usePikkuMutation('checkout', {
 *     onSuccess: (result) => {
 *       analytics.event('checkout_completed', { amount: result.total, currency: 'EUR' })
 *     },
 *   })
 *
 * Fire events from `onSuccess`, not from the click. The events worth putting on
 * a dashboard are **outcomes**, and an outcome is only known once the async work
 * succeeded.
 */
export function useAnalytics() {
  return { event: recordEvent }
}
