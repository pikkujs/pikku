import { defineProvider, defineWireProvider } from '@pikku/core/provider'
import { analyticsSinks } from '@pikku/core/analytics'

// events sees core's per-request auditLog when the function has an audit config.
export const events = defineWireProvider({
  optional: ['auditLog'],
  common: ({ auditLog }) => ({ events: { audited: auditLog !== undefined } }),
})

export const projectSink = defineProvider({
  addTo: analyticsSinks,
  common: () => ({ sink: { record: async () => {} }, map: {} }),
})
