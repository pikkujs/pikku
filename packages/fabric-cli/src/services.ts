import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
  LogLevel,
} from '@pikku/core/services'

/**
 * Minimal config + services for the fabric-cli pikku surface. CLI commands
 * run locally on the user's machine, so we keep the service layer thin —
 * enough to satisfy `pikku all` codegen and let commands talk HTTP to
 * fabric-api. Real per-command needs (auth state, HTTP client) get wired
 * in subsequent T1 commits.
 */
export const createConfig = pikkuConfig(async () => ({
  logLevel: LogLevel.info,
}))

export const createSingletonServices = pikkuServices(async (config) => {
  const variables = new LocalVariablesService()
  return {
    config,
    variables,
    secrets: new LocalSecretService(variables),
    logger: new ConsoleLogger(),
  }
})

export const createWireServices = pikkuWireServices(async () => ({}) as any)
