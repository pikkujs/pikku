import { pikkuServices, pikkuWireServices } from '#pikku/setup'
import { requiredSingletonServices } from '#pikku/pikku-services.gen.js'
import { ConsoleLogger, LocalVariablesService } from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import type { QueueService } from '@pikku/core/queue'
import type {
  KyselyVirtualUserRunStore,
  KyselyVirtualUserScheduleStore,
} from '@pikku/kysely'

export interface VerifierStores {
  virtualUserRunStore: KyselyVirtualUserRunStore
  virtualUserScheduleStore: KyselyVirtualUserScheduleStore
  queueService: QueueService
  auth?: () => Promise<any>
  agentRunner?: any
  variables?: LocalVariablesService
  metaService?: any
}

/**
 * The stores and the queue are handed in, so a test can hold the same instances
 * the app uses and look at what a tick left behind.
 */
export const createSingletonServices = pikkuServices(
  async (config, existingServices) => {
    const logger = new ConsoleLogger()
    let metaService = existingServices?.metaService
    if (requiredSingletonServices.metaService && !metaService) {
      const { PikkuMetaService } =
        await import('#pikku/services/pikku-meta-service.gen.js')
      metaService = new PikkuMetaService()
    }
    return {
      metaService,
      config,
      logger,
      variables: existingServices?.variables ?? new LocalVariablesService(),
      schema: new CFWorkerSchemaService(logger),
      virtualUserRunStore: existingServices?.virtualUserRunStore,
      virtualUserScheduleStore: existingServices?.virtualUserScheduleStore,
      queueService: existingServices?.queueService,
      auth: existingServices?.auth,
      agentRunner: existingServices?.agentRunner,
    }
  }
)

export const createWireServices = pikkuWireServices(async () => ({}))
