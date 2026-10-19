import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

export const CancelRunInput = z.object({
  runId: z.string(),
  reason: z.string().optional(),
})

export const CancelRunOutput = z.object({
  runId: z.string(),
  status: z.string(),
})

// @snippet start scopedFunction
export const cancelRun = pikkuFunc({
  expose: true,
  description: 'Stop a run that is queued or in flight.',
  input: CancelRunInput,
  output: CancelRunOutput,
  // `runs:cancel` is held by operators and not by builders. Stopping the
  // bleeding and changing the flow that caused it are different jobs, and the
  // person on call at 3am should be able to do the first without being able to
  // do the second.
  scopes: ['runs:cancel'],
  audit: true,
  func: async ({ kysely, eventHub, queueService}, { runId, reason }) => {
    const run = await kysely
      .selectFrom('flowRun')
      .select(['runId', 'status'])
      .where('runId', '=', runId)
      .executeTakeFirstOrThrow()

    if (!['queued', 'running'].includes(run.status)) {
      throw new Error(`Run is already ${run.status}`)
    }

    const finishedAt = new Date().toISOString()

    await kysely
      .updateTable('flowRun')
      .set({ status: 'cancelled', error: reason ?? null, finishedAt })
      .where('runId', '=', runId)
      .execute()

    // Steps that never started are skipped rather than failed: nothing went
    // wrong with them, they simply did not happen.
    await kysely
      .updateTable('runStep')
      .set({ status: 'skipped' })
      .where('runId', '=', runId)
      .where('status', '=', 'pending')
      .execute()

    await eventHub?.publish(`run:${runId}`, null, {
      type: 'run-cancelled',
      runId,
      reason: reason ?? null,
    })

    // The audit worker was wired to a queue nothing pushed to. This is the kind

    // of change it exists for: deliberate, human, and leaving no row of its own

    // that explains who did it.

    await queueService

      ?.add('audit-event', { entityType: 'run', entityId: runId, action: 'cancelled' })

      .catch(() => undefined)


    return { runId, status: 'cancelled' }
  },
})
// @snippet end scopedFunction
