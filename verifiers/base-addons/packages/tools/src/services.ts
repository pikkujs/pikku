import { pikkuAddonServices } from '#pikku/addon/setup'

/** Forwarded, never built: the project that wires the addon provides `stamper`. */
export const createSingletonServices = pikkuAddonServices(
  async (_config, { stamper }) => ({ stamper })
)
