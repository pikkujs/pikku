/**
 * Workflows whose parallel steps all finish at the same instant.
 *
 * Every `contentionStep` of a run sleeps until the shared `releaseAt`, so the
 * steps' completions — and the orchestration message each one enqueues —
 * reach the queue together. Every one of those messages wants the same run
 * lease at once, which is the contention `run-lease-contention.runner.ts`
 * measures.
 */
import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { pikkuSessionlessFunc } from '#pikku/function'

export const contentionStep = pikkuSessionlessFunc<
  { index: number; releaseAt: number },
  { index: number; square: number }
>({
  workflowQueued: true,
  func: async (_services, { index, releaseAt }) => {
    await new Promise((r) => setTimeout(r, Math.max(0, releaseAt - Date.now())))
    return { index, square: index * index }
  },
})

export const contentionItems = pikkuSessionlessFunc<
  { width: number; releaseAt: number },
  { items: Array<{ index: number; releaseAt: number }> }
>({
  func: async (_services, { width, releaseAt }) => ({
    items: Array.from({ length: width }, (_, index) => ({ index, releaseAt })),
  }),
})

export const contentionSum = pikkuSessionlessFunc<
  { results: Array<{ index: number; square: number }> },
  { count: number; sum: number }
>({
  func: async (_services, { results }) => ({
    count: results.length,
    sum: results.reduce((total, r) => total + r.square, 0),
  }),
})

export const runLeaseContentionWorkflow = pikkuWorkflowFunc<
  { indexes: number[]; releaseAt: number },
  { squares: number[] }
>({
  func: async (_services, data, { workflow }) => {
    const results = await Promise.all(
      data.indexes.map(
        async (index) =>
          await workflow.do(
            `square ${index}`,
            'contentionStep',
            { index, releaseAt: data.releaseAt },
            { retries: 0 }
          )
      )
    )
    return { squares: results.map((r) => r.square) }
  },
  tags: ['test', 'lease'],
})
