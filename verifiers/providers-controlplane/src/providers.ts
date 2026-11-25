import { defineProvider, defineWireProvider } from '@pikku/core/provider'
import { analyticsSinks } from '@pikku/core/analytics'

// Per-request auditLog: needs audit and logger, absent when there is no audit.
export const auditLog = defineWireProvider({
  optional: ['audit'],
  common: ({ audit, logger }) =>
    audit
      ? {
          auditLog: {
            write: (line: string) => logger.info(line),
            flush: async () => {},
          },
        }
      : {},
})

// events sees auditLog when it exists.
export const events = defineWireProvider({
  optional: ['auditLog'],
  common: ({ auditLog }) => ({ events: { audited: auditLog !== undefined } }),
})

export const projectSink = defineProvider({
  addTo: analyticsSinks,
  common: () => ({ sink: { record: async () => {} }, map: {} }),
})
