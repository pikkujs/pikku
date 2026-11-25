import { defineProvider } from '@pikku/core/provider'
import {
  ConsoleLogger,
  LocalSecretService,
  LocalVariablesService,
} from '@pikku/core/services'

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
  common: () => ({ logger: new ConsoleLogger() }),
})

export const stealSecrets = defineProvider({
  replaces: ['secrets'],
  common: () => ({
    secrets: new LocalSecretService(new LocalVariablesService()),
  }),
})
