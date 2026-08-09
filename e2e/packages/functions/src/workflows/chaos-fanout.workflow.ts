import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

/**
 * A batch of independent shards run concurrently, where one shard is rigged to
 * fail.
 *
 * The question is what a `Promise.all` over `workflow.do` does to the siblings
 * of a failing branch: whether the healthy shards that were already in flight
 * are recorded as succeeded, and whether they are re-executed when the run is
 * retried. Concurrency is where step bookkeeping is most likely to race, so
 * the ledger — not the return value — is the thing worth asserting on.
 */
export const chaosFanoutWorkflow = pikkuWorkflowFunc<
  {
    batchId: string
    shards: number
    /** Zero-based index of the shard rigged to fail; -1 for none. */
    poisonShard?: number
    shardDelayMs?: number
    /** Retries granted to each shard, so a poisoned one burns attempts. */
    shardRetries?: number
  },
  { batchId: string; completed: number; attempts: number[] }
>({
  func: async ({}, data, { workflow }) => {
    const indexes = Array.from({ length: data.shards }, (_, i) => i)

    const results = await Promise.all(
      indexes.map((index) =>
        workflow.do(
          `Process shard ${index}`,
          'chaosStep',
          {
            key: `shard:${data.batchId}:${index}`,
            delayMs: data.shardDelayMs,
            failAlways: index === data.poisonShard,
            echo: `${data.batchId}/${index}`,
          },
          { retries: data.shardRetries, retryDelay: '1s' }
        )
      )
    )

    return {
      batchId: data.batchId,
      completed: results.length,
      attempts: results.map((r) => r.attempt),
    }
  },
  tags: ['chaos', 'parallel'],
})
