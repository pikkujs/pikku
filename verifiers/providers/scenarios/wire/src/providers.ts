import { defineProvider, defineWireProvider } from '@pikku/core/provider'

export const probe = defineProvider(() => ({ probe: 'ok' }))
const stopLog = (name: string) => () => {
  ;(globalThis as { __stopLog?: string[] }).__stopLog?.push(name)
}
export const perRequest = defineWireProvider(({ logger }, wire) => ({
  requestScope: {
    logger,
    session: wire.session,
    stop: stopLog('requestScope'),
  },
}))
// A key some invocations leave out is optional in the merged type.
export const events = defineWireProvider({
  optional: ['auditLog'],
  common: ({ requestScope, auditLog }) => ({
    events: {
      audited: auditLog !== undefined,
      scope: requestScope,
      stop: stopLog('events'),
    },
  }),
})
export const sometimes = defineWireProvider(({ probe }) =>
  probe === 'ok' ? { maybe: { n: 1 } } : {}
)
// Reached by no function: never built.
export const unreached = defineWireProvider(() => ({
  neverBuilt: { stop: () => {} },
}))
