import { defineProvider } from '@pikku/core/provider'

// An unused identifier, an omitted parameter and an empty pattern all need nothing.
export const unusedParam = defineProvider((_services: object, env) => ({
  fromEnv: env.A,
}))
export const noParam = defineProvider(() => ({ plain: 1 }))
export const emptyPattern = defineProvider(({}) => ({ empty: 1 }))
