import { pikkuVoidFunc } from '#pikku/function'

/**
 * The morning sweep, across every company.
 *
 * Void and sessionless because a cron has no caller: there is no session to
 * read a company off, so this is the one function in the example that reads
 * across the tenant boundary.
 *
 * Deliberately NOT exposed. A sessionless function with `expose: true` is
 * reachable by anyone through `POST /rpc/:rpcName`, and `scopes` cannot save
 * it — scope checks fail closed on a session that does not exist. That is what
 * PKU574 warns about, and a cross-tenant sweep is the last thing that should
 * answer an anonymous caller. Forcing a run is the scheduler's job.
 *
 * It returns nothing. A scheduled task's result has nowhere to go, so the
 * outcome is a board event each company's dispatchers actually see.
 */
export const sweepOverdueJobs = pikkuVoidFunc({
  description: 'Cron job: announce overdue work on each company board.',
  func: async ({ kysely, eventHub, logger }) => {
    const now = new Date().toISOString()

    const rows = await kysely
      .selectFrom('job')
      .select(['jobId', 'companyId'])
      .where('status', 'in', ['scheduled', 'awaiting_parts'])
      .where('scheduledFor', '<', now)
      .execute()

    const byCompany = new Map<string, number>()
    for (const row of rows) {
      byCompany.set(row.companyId, (byCompany.get(row.companyId) ?? 0) + 1)
    }

    for (const [companyId, count] of byCompany) {
      await eventHub?.publish(`board:${companyId}`, null, {
        type: 'jobs.overdue',
        count,
      })
    }

    logger.info({
      event: 'overdue_sweep',
      jobs: rows.length,
      companies: byCompany.size,
    })
  },
})
