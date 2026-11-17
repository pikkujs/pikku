import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku/setup'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import type { RequiredSingletonServices } from '#pikku/pikku-services.gen.js'

export const createConfig = pikkuConfig(async () => {
  return {}
})

export const createSingletonServices = pikkuServices(
  async (config, existingServices): Promise<RequiredSingletonServices> => {
    const variables = existingServices?.variables || new LocalVariablesService()
    const secrets =
      existingServices?.secrets || new LocalSecretService(variables)
    const logger = new ConsoleLogger()
    const schema = new CFWorkerSchemaService(logger)

    // The generated RequiredSingletonServices still demands queueService,
    // schedulerService, workflowService and workflowRunService, which the nats
    // contributor (queue, scheduler) and the deploy build provide. The cast only
    // silences that type gap; it supplies no fallback, so a contributor that was
    // not applied still fails the verifier at run time. See the open question in
    // the queue-nats decision note.
    return {
      config,
      secrets,
      logger,
      variables,
      schema,
    } as unknown as RequiredSingletonServices
  }
)

export const createWireServices = pikkuWireServices(async () => {
  return {}
})
