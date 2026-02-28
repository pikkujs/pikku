import { pikkuAddonServices } from '#pikku'

export const createSingletonServices = pikkuAddonServices(
  async (_config, { jwt }) => {
    return { jwt }
  }
)
