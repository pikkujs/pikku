import { pikkuScenario } from '#pikku/scenarios'

/**
 * A scenario is a story of RPC calls told through a synthetic persona (an
 * "actor" — one exists per persona declared with definePersonas). Every step runs over
 * the REAL transport with the actor's session cookie, so a passing scenario
 * proves the deployed API works exactly as a signed-in user would experience it.
 *
 * Run it with `pikku scenario run local` (needs SCENARIO_ACTOR_SECRET in the
 * environment — the actor plugin in src/auth.ts refuses sign-ins without it).
 * It signs ANY defined actor in and reads their own session: actor sign-in,
 * session cookie, authed RPC, and session mapping in one pass — a ready-made
 * health check for staging or production.
 *
 * It is deliberately actor-AGNOSTIC: it uses the starter's `visitor` if present,
 * else the first actor the app defines. So when you replace the seeded `visitor`
 * with your own role actors (admin/operator/…), this keeps working untouched —
 * never edit it just to name a different actor.
 */
export const sessionHealthScenario = pikkuScenario<
  void,
  { email: string; userId: string }
>({
  title: 'Session health (scenario)',
  tags: ['scenario'],
  func: async ({ logger }, _input, { scenario, actors }) => {
    // Actor-AGNOSTIC on purpose: use whatever actor the app defines (the starter's
    // `visitor`, or your first role actor once you replace it). Never reference a
    // specific actor by name here — that is what forces an edit when the actor set
    // changes, and the fix is a robust scenario, not a renamed one.
    const [actor] = Object.values(actors ?? {})
    if (!actor) {
      throw new Error(
        'sessionHealthScenario needs at least one run actor — run via `pikku scenario run <environment>`'
      )
    }
    logger.debug('session-health scenario starting')
    const session = await scenario.do(
      'an actor signs in and reads their session',
      'getSession',
      {},
      { actor }
    )
    return { email: session.email, userId: session.userId }
  },
})
