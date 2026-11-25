import { defineProvider } from '@pikku/core/provider'

/**
 * Provides a `kysely` so the generated runner has one to wrap with column
 * coercion. The verifier only reads the generated platform-services file, so
 * the stand-in never has to be a real database. It has a `deploy` variant only:
 * `pikku dev` already holds a `kysely`, so it simply does not run it there.
 */
export const kyselyStandIn = defineProvider({
  deploy: () => {
    const kysely = { withPlugin: (_plugin: unknown) => kysely }
    return { kysely }
  },
})
