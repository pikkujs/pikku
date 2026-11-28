import { pikkuAddonServices } from '#pikku/addon/setup'

/** The database is the application's, so it is forwarded and never built. */
export const createSingletonServices = pikkuAddonServices(
  async (_config, existingServices) => existingServices
)
