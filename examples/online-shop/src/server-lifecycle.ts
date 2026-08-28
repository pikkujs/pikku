import { pikkuServerLifecycle } from '@pikku/core/utils'
import { provisionPersonas } from '@pikku/better-auth'
import { personaConfigs, personaEnvironments } from '#pikku/scenarios/pikku-personas.gen.js'
import type { SingletonServices } from './application-types.d.js'

/**
 * Provision the declared personas into whichever environment this process is,
 * so a deploy carries its actor accounts with it.
 *
 * Here rather than in `pikku persona sync`, which has no connection to a
 * deployed stage's database. A persona the environment rule refuses is skipped,
 * not created — which on production is every persona that is not `accountable`.
 */
export const serverLifecycle = pikkuServerLifecycle<SingletonServices>({
  afterStart: async ({ auth, scopeService, logger }) => {
    if (!scopeService) {
      logger.warn('No scopeService wired — personas will not be provisioned')
      return
    }
    try {
      const result = await provisionPersonas(
        { auth, scopeService, logger },
        { personas: personaConfigs, environments: personaEnvironments }
      )
      logger.info(
        `Personas provisioned: ${result.created} created, ${result.granted} granted, ${result.skipped.length} skipped`
      )
    } catch (error) {
      logger.warn(
        `Persona provisioning failed, scenarios will have no actors to sign in as: ${error}`
      )
    }
  },
})
