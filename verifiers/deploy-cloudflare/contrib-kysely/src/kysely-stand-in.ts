import type { Contributor } from '@pikku/core/contributors'

/**
 * Provides a `kysely` so the adapter's coercion contributor has something to
 * decorate. The verifier only reads the generated platform-services file, so
 * the stand-in never has to be a real database.
 */
export const kyselyStandIn: Contributor = {
  provides: ['kysely'],
  run(services) {
    const kysely = { withPlugin: (_plugin: unknown) => kysely }
    services.kysely = kysely
  },
}
