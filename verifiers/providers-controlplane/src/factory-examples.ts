import { pikkuServices, pikkuWireServices } from '#pikku/setup'
import type { RequiredSingletonServices } from '#pikku/pikku-services.gen.js'

// Checks existingServices.kysely and spreads existingServices.
export const createSingletonServices = pikkuServices(
  async (_config, existingServices): Promise<RequiredSingletonServices> => {
    const kysely = existingServices.kysely ?? { driver: 'own' }
    return {
      ...existingServices,
      kysely,
    } as unknown as RequiredSingletonServices
  }
)

// Builds an audited kysely per request when singletonServices.audit exists.
// A wire provider building 'kysely' shadows the singleton: PKU393, documented as expected.
export const createWireServices = pikkuWireServices(
  async (singletonServices) => {
    if (!(singletonServices as { audit?: unknown }).audit) return {}
    return { kysely: { driver: 'audited' } } as never
  }
)
