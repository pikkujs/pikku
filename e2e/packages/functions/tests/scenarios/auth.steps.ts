/**
 * Sign-in against Better Auth's own email endpoint.
 *
 * An actor cannot answer "can this person still sign in?": it authenticates
 * through the actor plugin with `SCENARIO_ACTOR_SECRET`, which a step has no
 * sanctioned way to read, and its session is established once and reused. The
 * user-management suite needs the opposite — a fresh credential check whose
 * refusal is the assertion — so these steps drive the real endpoint with an
 * email and password and report what it answered.
 *
 * The cookie the endpoint sets is deliberately discarded. A step result must be
 * JSON, and nothing downstream needs the session: what is being proven is that
 * the credentials were accepted or refused.
 */
import { pikkuScenarioStep } from '#pikku/scenarios/pikku-scenario-types.gen.js'
import { requireScenarioEnv } from '@pikku/core/scenario'
import type { ScenarioHttpResponse } from '@pikku/core/scenario'
import { postScenarioJson } from '@pikku/core/persona'

export const attemptsSignIn = pikkuScenarioStep<
  { email: string; password: string },
  ScenarioHttpResponse
>({
  name: 'attemptsSignIn',
  description: 'attempts an email sign-in and reports whether it was accepted',
  template: 'signs in as {email}',
  default: async (_services, { email, password }, { scenarioStep }) => {
    const apiUrl = requireScenarioEnv(scenarioStep).apiUrl
    return postScenarioJson(`${apiUrl}/api/auth/sign-in/email`, {
      body: { email, password },
      headers: { origin: apiUrl },
    })
  },
})

export const expectsSignIn = pikkuScenarioStep<
  { attempt: ScenarioHttpResponse; accepted: boolean },
  { ok: boolean }
>({
  name: 'expectsSignIn',
  description: 'expects a sign-in attempt to have been accepted or refused',
  template: 'expects the sign-in to be accepted: {accepted}',
  default: async (_services, { attempt, accepted }) => {
    if (attempt.ok !== accepted) {
      throw new Error(
        accepted
          ? `Expected the sign-in to be accepted, got ${attempt.status}: ${attempt.serialized}`
          : `Expected the sign-in to be refused, got ${attempt.status}`
      )
    }
    return { ok: attempt.ok }
  },
})
