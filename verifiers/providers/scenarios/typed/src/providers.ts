import { defineProvider } from '#pikku/provider'

export const maybeAudit = defineProvider({
  optional: ['queueService'],
  common: ({ queueService }) =>
    queueService ? { auditLog: { write: (_: string) => {} } } : {},
})

export const probe = defineProvider({
  optional: ['auditLog'],
  common: ({ auditLog, logger }) => {
    if (auditLog) auditLog.write('x')
    // @ts-expect-error auditLog is optional in the merged type
    auditLog.write('y')
    // @ts-expect-error logger is not any
    logger.noSuchMethod()
    return { probe: true }
  },
})
