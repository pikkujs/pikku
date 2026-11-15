import { createEventHubDistributor } from './event-hub-distributor.js'
import type { EventHubDistributor } from './event-hub-distributor.js'
import type {
  EventHubDistributorOptions,
  EventHubPublisher,
  EventHubRegistry,
} from './event-hub.types.js'
import { createLocalDeliveryBackend } from './local-delivery-backend.js'
import { setEventHubDistributor } from './runtime.js'
import {
  createSubscriptionSweeper,
  type SubscriptionSweeper,
} from './subscription-sweeper.js'

/** One minute: a revoked scope ends an open stream within a minute. */
export const DEFAULT_SUBSCRIPTION_RECHECK_MS = 60_000

/** What a host puts into the services it hands `createSingletonServices`, and puts back after. */
export interface EventHubHostServices {
  eventHub: EventHubPublisher
  eventHubRegistry: EventHubRegistry
}

/**
 * Creates the process's distributor, registers the delivery backend for
 * in-process channels (SSE streams and the sockets a host keeps itself), and
 * holds it in package state for the runtime. Call it before
 * `createSingletonServices`; hand `services` in, and assign them back over what
 * the app returned, so an app that built its own cannot replace the runtime's.
 * The distributor itself never goes into services.
 *
 * Open subscriptions are re-checked every `subscriptionRecheckMs` (default one
 * minute, `0` off): the sweeper re-runs each subscribe function and drops the
 * ones that now throw. Core cannot see how long a grant lives in the auth
 * provider, so this is how stale an open stream may be.
 */
export const installEventHubDistributor = (
  options: Partial<EventHubDistributorOptions> & {
    subscriptionRecheckMs?: number
  } = {}
): {
  distributor: EventHubDistributor
  services: EventHubHostServices
  sweeper: SubscriptionSweeper
} => {
  const { subscriptionRecheckMs, ...distributorOptions } = options
  const distributor = createEventHubDistributor(distributorOptions)
  distributor.registerDelivery(createLocalDeliveryBackend())
  setEventHubDistributor(distributor)
  const sweeper = createSubscriptionSweeper({
    distributor,
    recheckIntervalMs: subscriptionRecheckMs ?? DEFAULT_SUBSCRIPTION_RECHECK_MS,
    onError: (error, subscription) =>
      distributorOptions.onError?.(
        new Error(
          `Subscription to "${subscription.topic}" dropped: ${error instanceof Error ? error.message : String(error)}`
        )
      ),
  })
  if ((subscriptionRecheckMs ?? DEFAULT_SUBSCRIPTION_RECHECK_MS) > 0) {
    sweeper.start()
  }
  return {
    distributor,
    sweeper,
    services: {
      eventHub: distributor.publisher(),
      eventHubRegistry: distributor.registry(),
    },
  }
}
