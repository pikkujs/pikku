import { pikkuVoidFunc } from '#pikku/function'

/**
 * Runs that started and never finished.
 *
 * A crashed worker leaves a row saying `running` forever: nothing tells the
 * system the process died, so the only way to notice is to look for runs whose
 * start is older than any run should be. Absences are only visible by looking,
 * which is what a schedule is for.
 */
// @snippet start scheduledFunction
// @snippet start cleanupFunction
export const sweepStuckRuns = pikkuVoidFunc({
  // Exposed so an operator can run the sweep on demand and a scenario can
  // prove it still works. A job reachable only by its schedule is a job
  // nobody can test and nobody can force when it matters.
  expose: true,
  func: async ({ kysely, logger }) => {
    // An hour is deliberately generous. Marking a slow-but-alive run as failed is
    // worse than leaving a dead one visible for a while — the first loses work
    // and lies about it, the second is merely untidy.
    const cutoff = new Date(Date.now() - 3_600_000).toISOString()

    const result = await kysely
      .updateTable('flowRun')
      .set({ status: 'failed', error: 'Run did not report completion', finishedAt: new Date().toISOString() })
      .where('status', '=', 'running')
      .where('startedAt', '<', cutoff)
      .executeTakeFirst()

    logger.info({ event: 'stuck_runs_swept', failed: Number(result.numUpdatedRows ?? 0) })
  },
})
// @snippet end cleanupFunction
// @snippet end scheduledFunction
