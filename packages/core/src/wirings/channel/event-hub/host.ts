import { createEventHubDistributor } from './event-hub-distributor.js'
import type { EventHubDistributor } from './event-hub-distributor.js'
import type {
  EventHubDistributorOptions,
  EventHubPublisher,
  EventHubRegistry,
} from './event-hub.types.js'
import { createLocalDeliveryBackend } from './local-delivery-backend.js'
import { setEventHubDistributor } from './runtime.js'

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
 */
export const installEventHubDistributor = (
  options: Partial<EventHubDistributorOptions> = {}
): { distributor: EventHubDistributor; services: EventHubHostServices } => {
  const distributor = createEventHubDistributor(options)
  distributor.registerDelivery(createLocalDeliveryBackend())
  setEventHubDistributor(distributor)
  return {
    distributor,
    services: {
      eventHub: distributor.publisher(),
      eventHubRegistry: distributor.registry(),
    },
  }
}
