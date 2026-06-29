import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku'
import {
  ConsoleLogger,
  LocalVariablesService,
  LocalSecretService,
} from '@pikku/core/services'

import '../.pikku/pikku-bootstrap.gen.js'

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
  }
})

export const createWireServices = pikkuWireServices(async ({ logger }) => {
  return {} as any
})
