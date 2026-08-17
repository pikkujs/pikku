import { pikkuAddonServices } from '#pikku/addon'

/**
 * Forwarded, never constructed. Every one of them is the application's choice:
 * an addon that made its own `audit` sink would read a trail nobody writes to,
 * and its own `scopeService` would grant roles nothing checks.
 *
 * Nothing here touches a filesystem or a project root, which is what lets this
 * addon be wired into a deployed serverless unit — unlike `@pikku/addon-console`,
 * whose meta, code and knowledge services need a disk.
 */
export const createSingletonServices = pikkuAddonServices(
  async (_config, { scopeService, credentialService, audit, auth }) => ({
    scopeService,
    credentialService,
    audit,
    auth,
  })
)
