/**
 * Steps the app takes on its own.
 *
 * Nobody drives these. The order-update email goes out because an order
 * shipped, not because somebody clicked send, so writing it as a persona step
 * with the actor left off would put a person in a sentence that has none.
 *
 * Not cast in any scenario here: a platform step runs against local services by
 * design, and every scenario in this suite runs against a spawned server, so
 * nothing a platform step did would be visible to the run asserting it. It is
 * declared because the console reads declared steps — this is what the platform
 * subject on the personas page is showing.
 */
import { pikkuPlatformScenarioStep } from '#pikku/scenario'

export const shipsTheOrder = pikkuPlatformScenarioStep<
  { orderId: string; recipient?: string },
  { orderId: string }
>({
  name: 'shipsTheOrder',
  description: 'ships an order, which is what sends the shopper their update',
  template: 'ships order {orderId}',
  func: async (_services, { orderId, recipient }, { rpc }) => {
    await rpc.invoke('notifyShopper', { orderId, recipient })
    return { orderId }
  },
})
