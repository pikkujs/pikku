import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'
import { randomUUID } from 'node:crypto'

export const ExecuteFlowRunInput = z.object({
  runId: z.string(),
  actorId: z.string().optional(),
})

type GraphNode = { id: string; type: string; name?: string }

/**
 * The execution engine, run by the queue worker.
 *
 * Sessionless because a worker has no user — which is also why it carries no
 * scopes: an anonymous caller holds none and would satisfy none, so a
 * sessionless function with scopes rejects every caller it exists to serve.
 * Authorization already happened when somebody called `runFlow`.
 */
// @snippet start queueWorkerFunction
export const executeFlowRun = pikkuSessionlessFunc({
  description: 'Execute one queued run, step by step, recording each result.',
  input: ExecuteFlowRunInput,
  func: async ({ kysely, eventHub, logger }, { runId }) => {
    const run = await kysely
      .selectFrom('flowRun')
      .innerJoin('flowVersion', 'flowVersion.flowVersionId', 'flowRun.flowVersionId')
      .select(['flowRun.runId', 'flowRun.status', 'flowVersion.graph'])
      .where('flowRun.runId', '=', runId)
      .executeTakeFirstOrThrow()

    // A run cancelled while it sat in the queue must not start. The queue
    // cannot un-enqueue a job, so the check belongs here at the point of work.
    if (run.status !== 'queued') {
      logger.info({ event: 'run_skipped', runId, status: run.status })
      return
    }

    await kysely
      .updateTable('flowRun')
      .set({ status: 'running' })
      .where('runId', '=', runId)
      .execute()

    const nodes: GraphNode[] = JSON.parse(run.graph).nodes ?? []
    let sequence = 0

    try {
      for (const node of nodes) {
        // Re-read rather than trusting the status we started with: a cancel
        // can land mid-run, and finishing the remaining nodes anyway is the
        // failure mode operators complain about.
        const current = await kysely
          .selectFrom('flowRun')
          .select('status')
          .where('runId', '=', runId)
          .executeTakeFirstOrThrow()
        if (current.status === 'cancelled') return

        const stepId = randomUUID()
        const startedAt = new Date().toISOString()

        await kysely
          .insertInto('runStep')
          .values({
            stepId,
            runId,
            nodeId: node.id,
            nodeType: node.type,
            sequence: sequence++,
            status: 'running',
            startedAt,
          })
          .execute()

        // A real engine dispatches by node type here — an HTTP call, an RPC
        // into another function, a queue publish. The template records the
        // step so the run history and live log are exercised end to end.
        const output = { ok: true, node: node.name ?? node.id }

        await kysely
          .updateTable('runStep')
          .set({
            status: 'succeeded',
            output: JSON.stringify(output),
            finishedAt: new Date().toISOString(),
          })
          .where('stepId', '=', stepId)
          .execute()

        await eventHub?.publish(`run:${runId}`, null, {
          type: 'step-finished',
          runId,
          nodeId: node.id,
          status: 'succeeded',
        })
      }

      await kysely
        .updateTable('flowRun')
        .set({ status: 'succeeded', finishedAt: new Date().toISOString() })
        .where('runId', '=', runId)
        .execute()
    } catch (error) {
      await kysely
        .updateTable('flowRun')
        .set({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          finishedAt: new Date().toISOString(),
        })
        .where('runId', '=', runId)
        .execute()
      throw error
    }

    await eventHub?.publish(`run:${runId}`, null, { type: 'run-finished', runId })
  },
})
// @snippet end queueWorkerFunction
