import { pikkuVoidFunc } from '#pikku/function'

/**
 * Anyone who was due to arrive yesterday and never did.
 *
 * Run nightly rather than on a timer per booking: a booking that becomes a
 * no-show is not an event the system is told about, it is the absence of one,
 * and absences are only visible by looking.
 */
// @snippet start scheduledFunction
// @snippet start cleanupFunction
export const sweepNoShows = pikkuVoidFunc({
  // Exposed so an operator can run the sweep on demand and a scenario can
  // prove it still works. A job reachable only by its schedule is a job
  // nobody can test and nobody can force when it matters.
  expose: true,
  func: async ({ kysely, logger }) => {
    const result = await kysely
      .updateTable('booking')
      .set({ status: 'no_show' })
      .where('status', 'in', ['held', 'confirmed'])
      .where('arrival', '<', new Date(Date.now() - 86_400_000).toISOString().slice(0, 10))
      .executeTakeFirst()

    logger.info({
      event: 'no_show_sweep',
      marked: Number(result.numUpdatedRows ?? 0),
    })
  },
})
// @snippet end cleanupFunction
// @snippet end scheduledFunction
