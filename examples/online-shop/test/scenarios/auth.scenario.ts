/**
 * Replaces e2e/tests/features/auth.feature.
 *
 * The gherkin drove the login form: "a test account exists" → "the user signs
 * in through the login form" → "they land on the app". Scenario actors are
 * signed in by the runner before the first step, so there is no form to drive
 * and no signed-out state to start from. What that gherkin actually proved —
 * a real session, carried in a real cookie, admitted to the gated area — is
 * proved here by opening `/app` and not being bounced to `/app/login`.
 *
 * This is the same claim over a shorter path, and it now covers the actor
 * sign-in endpoint too, which is what every other browser scenario depends on.
 * The login FORM itself is no longer covered; if that matters to your app, test
 * it as an API scenario against `/api/auth/sign-in/email`, which is where a
 * wrong password is actually refused.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenarios'

/** The gated area. `staticRoutes` skips /app/login, so only this scenario asserts the guard. */
const APP_HOME = '/app'

export const signedInActorReachesTheAppScenario = pikkuScenario<
  void,
  { pathname: string; email: string }
>({
  title: 'A signed-in user reaches the app',
  description:
    'The session cookie carries into the browser and the route guard admits it',
  tags: ['scenario', 'auth', 'smoke'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.visitor) {
      throw new Error(
        'signedInActorReachesTheAppScenario needs the visitor actor — run via `pikku scenario run <environment>`'
      )
    }

    const landed = await scenario.when(
      'opens the app',
      'opensPage',
      { path: APP_HOME },
      {
        actor: actors.visitor,
      }
    )
    if (landed.status != null && landed.status >= 400) {
      throw new Error(`${APP_HOME} answered HTTP ${landed.status}`)
    }

    // The guard check is a `then` rather than an `if`/`throw`: this is the claim
    // the scenario exists to make, and only a `then` counts toward witness
    // coverage. A ladder with no assertion fails inspection outright (PKU680).
    await scenario.then(
      'stays in the app',
      'restsOnPath',
      { path: APP_HOME },
      {
        actor: actors.visitor,
      }
    )

    // The same session over the API: the browser is admitted AND the server
    // agrees who it is. One without the other is a half-proven login.
    // `do` is the RPC path; given/when/then are typed against the declared
    // steps, so an RPC name only resolves through this one.
    const session = await scenario.do(
      'reads their own session',
      'getSession',
      {},
      {
        actor: actors.visitor,
      }
    )

    return { pathname: landed.pathname, email: session.email }
  },
})

export const authFeature = pikkuFeature({
  name: 'Authentication',
  description:
    'A signed-in session reaches the gated app and identifies its user',
  tags: ['auth', 'smoke'],
  scenarios: [signedInActorReachesTheAppScenario],
})
