import { pikkuScenario } from '#pikku/scenarios'

/**
 * A scenario is a story of RPC calls told through a synthetic virtual user (an
 * "virtualUser" — one exists per virtual user declared with defineVirtualUsers). Every step runs over
 * the REAL transport with the virtual user's session cookie, so a passing scenario
 * proves the deployed API works exactly as a signed-in user would experience it.
 *
 * Run it with `pikku scenario run local` (needs the key `pikku dev` creates —
 * the virtual user plugin in src/auth.ts refuses sign-ins without a signed statement).
 * It signs ANY defined virtual user in and reads their own session: virtual user sign-in,
 * session cookie, authed RPC, and session mapping in one pass — a ready-made
 * health check for staging or production.
 *
 * It is deliberately virtual user-AGNOSTIC: it uses the starter's `visitor` if present,
 * else the first virtual user the app defines. So when you replace the seeded `visitor`
 * with your own role virtual users (admin/operator/…), this keeps working untouched —
 * never edit it just to name a different virtual user.
 */
export const sessionHealthScenario = pikkuScenario<
  void,
  { email: string; userId: string }
>({
  title: 'Session health (scenario)',
  tags: ['scenario'],
  func: async ({ logger }, _input, { scenario, virtualUsers }) => {
    // Virtual user-AGNOSTIC on purpose: use whatever virtual user the app defines (the starter's
    // `visitor`, or your first role virtual user once you replace it). Never reference a
    // specific virtual user by name here — that is what forces an edit when the virtual user set
    // changes, and the fix is a robust scenario, not a renamed one.
    const [virtualUser] = Object.values(virtualUsers ?? {})
    if (!virtualUser) {
      throw new Error(
        'sessionHealthScenario needs at least one run virtual user — run via `pikku scenario run <environment>`'
      )
    }
    logger.debug('session-health scenario starting')
    const session = await scenario.do(
      'a virtual user signs in and reads their session',
      'getSession',
      {},
      { virtualUser }
    )
    return { email: session.email, userId: session.userId }
  },
})
