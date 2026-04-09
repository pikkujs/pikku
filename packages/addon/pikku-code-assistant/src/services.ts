import { pikkuAddonServices } from '#pikku'

export const createSingletonServices = pikkuAddonServices(
  async (_config, _parentServices) => {
    return {}
  }
)
