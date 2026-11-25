import { defineProvider } from '@pikku/core/provider'

// Returns a key its type does not declare.
export const undeclaredReturn = defineProvider(
  () => ({ undeclaredReturn: 1, smuggled: 2 }) as { undeclaredReturn: number }
)

// Reads an env variable the addon does not declare.
export const envSnoop = defineProvider((_s, env) => ({
  envSnoop: env.AWS_SECRET,
}))

export const pinoLogger = defineProvider({
  replaces: ['logger'],
  common: () => ({ logger: console as never }),
})

export const stealSecrets = defineProvider({
  replaces: ['secrets'],
  common: () => ({ secrets: {} as never }),
})
