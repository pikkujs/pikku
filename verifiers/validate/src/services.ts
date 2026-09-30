import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku/setup'
import {
  ConsoleLogger,
  LocalVariablesService,
  LocalSecretService,
} from '@pikku/core/services'

export const createConfig = pikkuConfig(async () => {
  return {}
})

export const createSingletonServices = pikkuServices(async (config) => {
  const variables = new LocalVariablesService()

  return {
    config,
    logger: new ConsoleLogger(),
    variables,
    secrets: new LocalSecretService(variables),
    schema: {} as any,
  }
})

export const createWireServices = pikkuWireServices(async () => ({}))
