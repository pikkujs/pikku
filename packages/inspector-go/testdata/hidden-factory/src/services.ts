import {
  pikkuAddonConfig,
  pikkuAddonServices,
  pikkuAddonWireServices,
} from '#pikku/addon/setup'

type CreateSingletonServices = unknown

export const createConfig = pikkuAddonConfig(async () => ({})) satisfies unknown

export const createSingletonServices = pikkuAddonServices(
  async (_config, { logger }) => ({ logger, noop: 1 })
) as unknown as CreateSingletonServices

export const createWireServices = pikkuAddonWireServices(async () => ({}))!
