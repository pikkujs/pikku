/**
 * Driving the shop's own HTTP surface from a step, for the things a
 * `scenario.do(name, rpcName, ...)` cannot see.
 *
 * `scenario.do` runs an RPC and yields its result. What these steps assert is
 * about the workflow RUN — its id, the status the console reads back — which
 * only `/workflow/:name/{start,status}` reports, so the step has to speak HTTP
 * itself. `requireScenarioEnv` is where it learns which server to speak to: the
 * same environment the actors were signed into, never a hardcoded localhost.
 */
import {
  createCookieJar,
  pikkuScenarioStep,
  pollUntil,
  postScenarioJson,
  readScenarioHttpResponse,
  requireScenarioEnv,
  type ScenarioHttpResponse,
} from '#pikku/scenarios'

/** What the workflow route answered, plus what it says about the run itself. */
export interface CheckoutRun extends ScenarioHttpResponse {
  runId?: string
  /** `completed`, `failed` or `cancelled` — the run's own status, not the HTTP one. */
  outcome?: string
}

const TERMINAL = ['completed', 'failed', 'cancelled']

// @snippet start scenarioHttpStep
export const startsCheckout = pikkuScenarioStep<
  { basketId: string; userId: string },
  CheckoutRun
>({
  name: 'startsCheckout',
  description: 'starts the checkout workflow over HTTP and reports the run',
  template: 'starts checkout for {basketId}',
  default: async (_services, { basketId, userId }, { scenarioStep }) => {
    const { apiUrl } = requireScenarioEnv(scenarioStep)
    const response = await postScenarioJson<{ runId?: string } | undefined>(
      `${apiUrl}/workflow/checkoutWorkflow/start`,
      {
        body: {
          data: {
            basketId,
            userId,
            shippingAddress: {
              line1: '1 High Street',
              city: 'London',
              postcode: 'N1 1AA',
              country: 'GB',
            },
          },
        },
      }
    )
    return { ...response, runId: response.body?.runId }
  },
})
// @snippet end scenarioHttpStep

// @snippet start scenarioPolling
export const awaitsCheckout = pikkuScenarioStep<
  { run: CheckoutRun; timeoutMs?: number },
  CheckoutRun
>({
  name: 'awaitsCheckout',
  description: 'waits for a started checkout run to reach a terminal status',
  template: 'waits for the checkout to finish',
  default: async (_services, { run, timeoutMs }, { scenarioStep }) => {
    if (!run.runId) throw new Error(`Checkout never started: ${run.serialized}`)
    const { apiUrl } = requireScenarioEnv(scenarioStep)
    let last = ''
    const finished = await pollUntil(
      async () => {
        const response = await readScenarioHttpResponse<
          { status?: string } | undefined
        >(
          await fetch(`${apiUrl}/workflow/checkoutWorkflow/status/${run.runId}`)
        )
        last = response.serialized
        const outcome = response.body?.status
        return outcome && TERMINAL.includes(outcome)
          ? { ...response, runId: run.runId, outcome }
          : undefined
      },
      { timeoutMs: timeoutMs ?? 30_000, intervalMs: 100 }
    )
    if (!finished) {
      throw new Error(`Run ${run.runId} never finished: ${last}`)
    }
    return finished
  },
})
// @snippet end scenarioPolling

// @snippet start scenarioCookieJar
/**
 * Signing up is the one flow an actor cannot perform, because an actor is
 * already signed in before the first step runs. The jar is what makes it
 * possible from a bare `fetch`: it keeps the Set-Cookie the sign-up returned
 * and replays it on the next call, so the session survives the hop the way a
 * browser's would.
 */
export const signsUpShopper = pikkuScenarioStep<
  { email: string; password: string },
  { signedUpAs?: string }
>({
  name: 'signsUpShopper',
  description: 'signs a new shopper up and reads back the session it created',
  template: 'signs up as {email}',
  default: async (_services, { email, password }, { scenarioStep }) => {
    const { apiUrl } = requireScenarioEnv(scenarioStep)
    const jar = createCookieJar(apiUrl)
    await jar.fetch(`${apiUrl}/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, name: email }),
    })
    const session = await readScenarioHttpResponse<{
      user?: { email?: string }
    } | null>(await jar.fetch(`${apiUrl}/auth/get-session`))
    return { signedUpAs: session.body?.user?.email }
  },
})
// @snippet end scenarioCookieJar
