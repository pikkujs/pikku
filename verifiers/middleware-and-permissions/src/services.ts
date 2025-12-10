import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku'
import {
  LocalVariablesService,
  LocalSecretService,
  LogLevel,
} from '@pikku/core/services'
import { CustomLogger } from './services/custom-logger.service.js'

export const createConfig = pikkuConfig(async () => {
  return {
    logLevel: LogLevel.debug,
  }
})

export const createSingletonServices = pikkuServices(async (config) => {
  const logger = new CustomLogger()
  const variables = new LocalVariablesService()

  return {
    variables,
    config,
    logger,
    secrets: new LocalSecretService(variables),
  }
})

export const createWireServices = pikkuWireServices(
  async (_services, _session) => {
    return {} as any
  }
)
