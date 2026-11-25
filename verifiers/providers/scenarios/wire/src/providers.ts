import { defineProvider, defineWireProvider } from '@pikku/core/provider'

export const probe = defineProvider(() => ({ probe: 'ok' }))
export const perRequest = defineWireProvider(({ logger }, wire) => ({
  requestScope: { logger, session: wire.session },
}))
// A key some invocations leave out is optional in the merged type.
export const events = defineWireProvider({
  optional: ['auditLog'],
  common: ({ requestScope, auditLog }) => ({
    events: { audited: auditLog !== undefined, scope: requestScope },
  }),
})
export const sometimes = defineWireProvider(({ probe }) =>
  probe === 'ok' ? { maybe: { n: 1 } } : {}
)
// Reached by no function: never built.
export const unreached = defineWireProvider(() => ({
  neverBuilt: { stop: () => {} },
}))
