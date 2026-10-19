import { pikkuVoidFunc } from '#pikku/function'

/**
 * Invitations that were never accepted.
 *
 * An expiry is an absence — nobody tells the system that an invitation went
 * unanswered — so it is only visible by looking, which is what a schedule is
 * for. Left alone, a stale invite is a standing offer of access to a tenant.
 */
// @snippet start scheduledFunction
// @snippet start cleanupFunction
export const expireInvitations = pikkuVoidFunc({
  // Exposed so an operator can run the sweep on demand and a scenario can
  // prove it still works. A job reachable only by its schedule is a job
  // nobody can test and nobody can force when it matters.
  expose: true,
  func: async ({ kysely, logger }) => {
    const result = await kysely
      .updateTable('invitation')
      .set({ status: 'expired' })
      .where('status', '=', 'pending')
      .where('expiresAt', '<', new Date().toISOString())
      .executeTakeFirst()

    logger.info({
      event: 'invitations_expired',
      expired: Number(result.numUpdatedRows ?? 0),
    })
  },
})
// @snippet end cleanupFunction
// @snippet end scheduledFunction
