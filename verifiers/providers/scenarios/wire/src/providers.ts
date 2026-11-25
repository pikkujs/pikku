import { defineProvider, defineWireProvider } from '@pikku/core/provider'

export const probe = defineProvider(() => ({ probe: 'ok' }))
export const perRequest = defineWireProvider(({ logger }, wire) => ({
  requestScope: { logger, session: wire.session },
}))
