import { defineProvider } from '@pikku/core/provider'

/**
 * Reads the one fact only a deploy has, the unit's name, from the environment.
 * The `dev` variant is what keeps it out of the way of `pikku dev`.
 */
export const unitTag = defineProvider({
  dev: () => ({ unitTag: 'dev' }),
  deploy: ({}, env) => ({ unitTag: env.PIKKU_UNIT ?? 'unnamed' }),
})
