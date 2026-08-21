import { pikkuFunc } from '#pikku/addon/function'

/**
 * What the virtual users have been doing, newest first.
 *
 * Read off the host's own `virtualUserRunStore` rather than through the
 * scaffolded RPCs, so the console shows a project's runs whether or not that
 * project turned `scaffold.virtualUser` on — wiring the store is the only thing
 * a run needs, and it is what a run already needs.
 *
 * SECURITY: an `adversarial` run's findings are working exploits carrying live
 * ids. This is a privileged read, which is why it has a scope of its own rather
 * than riding on the wirings one.
 */
const MAX_RUNS = 100

export const getVirtualUserRuns = pikkuFunc<
  { persona?: string; limit?: number; offset?: number },
  any[]
>({
  title: 'Get Virtual User Runs',
  description:
    'Returns recorded virtual user runs, newest first. Accepts optional persona, limit and offset.',
  expose: true,
  scopes: ['pikku:console:virtualUsers:read'],
  func: async ({ virtualUserRunStore }, input) => {
    if (!virtualUserRunStore) {
      return []
    }
    const runs = await virtualUserRunStore.list({
      persona: input?.persona,
      // The scaffolded read bounds this through zod; nothing types a console
      // function's input at runtime, so the ceiling is applied here instead of
      // letting a caller ask the store for every run an app has ever recorded.
      limit: Math.min(input?.limit ?? MAX_RUNS, MAX_RUNS),
      offset: input?.offset,
    })
    return runs.map((run) => ({
      ...run,
      createdAt: run.createdAt.toISOString(),
      finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    }))
  },
})
