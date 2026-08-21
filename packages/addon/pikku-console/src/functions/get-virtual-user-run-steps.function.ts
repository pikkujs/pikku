import { pikkuFunc } from '#pikku/addon/function'

/**
 * One run's turns, in the order they happened.
 *
 * Its own call rather than a field on the run: a run at a 500-step budget
 * carries more transcript than every other column together, so the list would
 * pay for it on every row.
 *
 * SECURITY: the transcript is strictly more sensitive than the summary it
 * belongs to — it carries the live ids and payloads the run actually sent.
 */
export const getVirtualUserRunSteps = pikkuFunc<
  { runId: string; limit?: number; offset?: number },
  any[]
>({
  title: 'Get Virtual User Run Steps',
  description:
    'Returns every turn one virtual user run took: what it called, what came back, and what that cost.',
  expose: true,
  scopes: ['pikku:console:virtualUsers:read'],
  func: async ({ virtualUserRunStore }, input) => {
    if (!virtualUserRunStore) {
      return []
    }
    return await virtualUserRunStore.steps(input.runId, {
      limit: input?.limit,
      offset: input?.offset,
    })
  },
})
