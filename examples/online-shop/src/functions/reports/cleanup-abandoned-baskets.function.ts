import { pikkuVoidFunc } from '#pikku/function'

// @snippet start cleanupAbandonedBaskets
// @snippet start cleanupFunction
export const cleanupAbandonedBaskets = pikkuVoidFunc({
  // Exposed so an operator can run the sweep on demand and a scenario can
  // prove it still works. A job reachable only by its schedule is a job
  // nobody can test and nobody can force when it matters.
  expose: true,
  description: 'Cron job: remove anonymous baskets older than 7 days.',
  func: async ({ kysely, logger }) => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)

    const result = await kysely
      .deleteFrom('basket')
      .where('userId', 'is', null)
      .where('updatedAt', '<', cutoff.toISOString())
      .executeTakeFirst()

    logger.info({
      event: 'cleanup_abandoned_baskets',
      deleted: Number(result.numDeletedRows ?? 0),
    })
  },
})
// @snippet end cleanupFunction
// @snippet end cleanupAbandonedBaskets
