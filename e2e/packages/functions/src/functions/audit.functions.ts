import { pikkuFunc } from '#pikku/function'

/**
 * Records one audit event, so the audit suite has a trail produced by the real
 * path — `audit: true` on the function, `auditLog.write()` in its body, the
 * runner filling in actor/function/trace, the sink persisting it — rather than
 * by rows inserted behind the runtime's back.
 *
 * Exposed so a scenario can call it as an RPC. `type` is an input because two
 * distinct actions are what makes the console's action filter testable.
 */
export const recordAuditEvent = pikkuFunc<
  { type: string; entityId?: string },
  { recorded: true }
>({
  expose: true,
  audit: true,
  func: async ({ auditLog }, { type, entityId }) => {
    await auditLog?.write({
      type,
      source: 'explicit',
      outcome: 'success',
      metadata: {
        entity: 'invoice',
        entityId: entityId ?? 'inv-1',
        before: { status: 'open' },
        after: { status: 'cancelled' },
      },
    })
    return { recorded: true }
  },
})

/**
 * The other half of the contract: a function that never declared `audit`, whose
 * write is dropped with a warning. Without it the suite could not tell a
 * working sink from one that records everything anyone asks it to.
 */
export const recordUnauditedEvent = pikkuFunc<
  { type: string },
  { recorded: true }
>({
  expose: true,
  func: async ({ auditLog }, { type }) => {
    await auditLog?.write({ type, source: 'explicit' })
    return { recorded: true }
  },
})
