import {
  pikkuAddonConfig,
  pikkuAddonServices,
  pikkuAddonWireServices,
} from '#pikku'
import type { Config } from '../types/application-types.d.ts'

export const createConfig = pikkuAddonConfig(
  async (services) => services.config as Config
)

export const createSingletonServices = pikkuAddonServices(
  async (_config, services) => services
)

export const createWireServices = pikkuAddonWireServices(
  async (services) => services
)
