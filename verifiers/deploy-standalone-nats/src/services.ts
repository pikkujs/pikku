import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku/setup'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'
import { CFWorkerSchemaService } from '@pikku/schema-cfworker'
import { connectNats } from '@pikku/queue-nats'
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

    const env: Record<string, string | undefined> = {}
    for (const name of [
      'NATS_URL',
      'NATS_USER',
      'NATS_PASSWORD',
      'PIKKU_PROJECT',
      'PIKKU_STAGE',
    ]) {
      env[name] = await variables.get(name)
    }
    const nats = await connectNats(logger, env)

    // `natsLifecycle` stays last: services stop in reverse order, so the jobs
    // in flight drain while everything built before it is still running. The
    // cast covers workflowService and workflowRunService, which the deploy
    // build provides.
    return {
      config,
      secrets,
      logger,
      variables,
      schema,
      ...nats,
    } as unknown as RequiredSingletonServices
  }
)

export const createWireServices = pikkuWireServices(async () => {
  return {}
})
