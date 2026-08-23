import { addHTTPMiddleware } from '@pikku/core/http'
import { authBearer } from '@pikku/core/middleware'

/**
 * A bearer token that stands in for a signed-in user on the agent demo.
 *
 * Agent threads are owned by the session principal. A request with no session
 * gets an ephemeral owner that is minted per request and never reused, so a
 * sessionless caller cannot come back to a thread it created a moment ago — by
 * design, because otherwise anyone could reach any thread by naming its id. The
 * agent clients need memory across turns, so they need a session.
 *
 * The token is read from a secret rather than written here: an unset secret
 * leaves the middleware inert, which is the right default for a template
 * somebody copies. `run-tests.sh` exports a fresh value for the server and the
 * client together.
 *
 * knowledge: decisions/security/agent-sessionless-deployments-have-no-thread-ownership.md
 */
// @snippet start add-http-middleware
export const agentDemoAuth = () =>
  addHTTPMiddleware('/rpc/*', [
    authBearer({
      token: {
        secretId: 'AGENT_DEMO_TOKEN',
        userSession: { userId: 'demo-user' },
      },
    }),
  ])
// @snippet end add-http-middleware
