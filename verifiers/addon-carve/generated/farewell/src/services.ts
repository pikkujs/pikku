import { pikkuAddonServices } from '#pikku'

// Services this addon requires from the host (recorded as required parent services).
export const createSingletonServices = pikkuAddonServices(
  async (_config, {}) => ({})
)
