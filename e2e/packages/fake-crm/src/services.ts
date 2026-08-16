import { pikkuAddonWireServices } from '#pikku/addon'

// The addon exposes no extra request-scoped services; the wire factory exists so
// pikku registers this package (its credential + secret requirements) as an addon.
export const createWireServices = pikkuAddonWireServices(async () => ({}))
