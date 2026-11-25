import { defineProvider } from '@pikku/core/provider'

// factory form
export const factoryForm = defineProvider(({ logger }) => ({ cache: logger }))

// object form with variants and optional
export const objectForm = defineProvider({
  optional: ['queueService'],
  dev: ({ logger, queueService }) => ({ store: [logger, queueService] }),
  'deploy:cloudflare-worker': ({ logger }) => ({ store: logger }),
  common: ({ logger }) => ({ store: logger }),
})

// variant by reference, in its own module
export const deployVariant = ({ logger }: { logger: unknown }) => ({ viaRef: logger })
export const byReference = defineProvider({ deploy: deployVariant })

// replaces
export const pino = defineProvider({ replaces: ['logger'], common: () => ({ logger: {} as never }) })

// re-exported under an alias: the provider name is q
const p = defineProvider(() => ({ aliased: 1 }))
export { p as q }
