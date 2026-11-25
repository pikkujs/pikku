import { defineWireProvider } from '@pikku/core/provider'

export const perRequest = defineWireProvider(({ logger }, wire) => ({ scope: [logger, wire] }))
