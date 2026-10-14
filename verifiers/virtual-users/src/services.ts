import { pikkuServices, pikkuWireServices } from '#pikku/setup'
import { ConsoleLogger, LocalVariablesService } from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import type { QueueService } from '@pikku/core/queue'
import type {
  VirtualUserRunStore,
  VirtualUserScheduleStore,
} from '@pikku/core/virtual-user'

export interface VerifierStores {
  virtualUserRunStore: VirtualUserRunStore
  virtualUserScheduleStore: VirtualUserScheduleStore
  queueService: QueueService
}

/**
 * The stores and the queue are handed in, so a test can hold the same instances
 * the app uses and look at what a tick left behind.
 */
export const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const logger = new ConsoleLogger()
    return {
      config,
      logger,
      variables: new LocalVariablesService(),
      schema: new CFWorkerSchemaService(logger),
      virtualUserRunStore: existingServices?.virtualUserRunStore,
      virtualUserScheduleStore: existingServices?.virtualUserScheduleStore,
      queueService: existingServices?.queueService,
    }
  }
)

export const createWireServices = pikkuWireServices(async () => ({}))
