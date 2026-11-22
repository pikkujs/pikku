import { ConsoleLogger } from '@pikku/core/services'
import { pikkuConfig, pikkuServices, pikkuWireServices } from '#pikku/setup'

export const createConfig = pikkuConfig(async () => ({}))

export const createSingletonServices = pikkuServices(async (config) => ({
  config,
  logger: new ConsoleLogger(),
  stamper: { stamp: (text: string) => `[stamped] ${text}` },
}))

export const createWireServices = pikkuWireServices(async () => ({}))
