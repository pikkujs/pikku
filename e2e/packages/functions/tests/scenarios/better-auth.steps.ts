/**
 * Email/password authentication, driven through the REAL Better Auth client SDK
 * — the same one a frontend uses — over real HTTP against the running server.
 * Nothing here hand-rolls an endpoint call.
 *
 * A browser persists the session cookie automatically; in this process a cookie
 * jar has to do it. The jar is a closure local created and discarded inside a
 * single step, because a step result must be JSON and a jar is not — so each
 * step performs one whole interaction, sign-in through assertion-relevant read,
 * rather than leaving a session behind for the next one. `getSession` is a
 * separate HTTP request either way, which is exactly what "the session persists
 * between requests" is asserting.
 *
 * The jar also stamps `Origin`: Better Auth rejects a state-changing POST whose
 * Origin does not match the baseURL.
 */
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { createAuthClient } from 'better-auth/client'
import { createCookieJar, requireScenarioEnv } from '@pikku/core/scenario'

const authClientFor = (apiUrl: string) =>
  createAuthClient({
    baseURL: apiUrl,
    fetchOptions: { customFetchImpl: createCookieJar(apiUrl).fetch },
  })

export interface AuthAttempt {
  /** Whether the call the step performed was accepted. */
  ok: boolean
  /** The email the session reports afterwards, absent when there is none. */
  sessionEmail?: string
  error?: string
}

/**
 * Signs a new user up and reports the session the sign-up established, so a
 * scenario can assert both that it was accepted and who it signed in as.
 */
export const signsUpUser = pikkuScenarioStep<
  { email: string; password: string },
  AuthAttempt
>({
  name: 'signsUpUser',
  description: 'signs a new user up and reads the session it established',
  template: 'signs up as {email}',
  default: async (_services, { email, password }, { scenarioStep }) => {
    const client = authClientFor(requireScenarioEnv(scenarioStep).apiUrl)
    const { error } = await client.signUp.email({
      name: email,
      email,
      password,
    })
    if (error) {
      return { ok: false, error: JSON.stringify(error) }
    }
    const { data } = await client.getSession()
    return { ok: true, sessionEmail: data?.user?.email }
  },
})

/**
 * Signs in and then reads the session back over a SECOND request on the same
 * jar — which is what proves the session persists between requests rather than
 * merely being echoed by the sign-in response.
 */
export const signsInAndReadsSession = pikkuScenarioStep<
  { email: string; password: string },
  AuthAttempt
>({
  name: 'signsInAndReadsSession',
  description: 'signs in and reads the session back on a second request',
  template: 'signs in as {email}',
  default: async (_services, { email, password }, { scenarioStep }) => {
    const client = authClientFor(requireScenarioEnv(scenarioStep).apiUrl)
    const { error } = await client.signIn.email({ email, password })
    if (error) {
      return { ok: false, error: `sign-in failed (${error.status})` }
    }
    const { data } = await client.getSession()
    return { ok: true, sessionEmail: data?.user?.email }
  },
})

/**
 * Signs in, signs out, and reads the session back. Sign-out is only meaningful
 * against the jar that holds the session it revokes, which is why the whole
 * round trip lives in one step.
 */
export const signsOutAndReadsSession = pikkuScenarioStep<
  { email: string; password: string },
  AuthAttempt
>({
  name: 'signsOutAndReadsSession',
  description: 'signs in, signs out and reads the session back',
  template: 'signs {email} out',
  default: async (_services, { email, password }, { scenarioStep }) => {
    const client = authClientFor(requireScenarioEnv(scenarioStep).apiUrl)
    const signIn = await client.signIn.email({ email, password })
    if (signIn.error) {
      throw new Error(
        `Sign-in failed unexpectedly: ${JSON.stringify(signIn.error)}`
      )
    }
    const signOut = await client.signOut()
    if (signOut.error) {
      throw new Error(
        `Sign-out failed unexpectedly: ${JSON.stringify(signOut.error)}`
      )
    }
    const { data } = await client.getSession()
    return { ok: true, sessionEmail: data?.user?.email }
  },
})

export const expectsAuthAttempt = pikkuScenarioStep<
  { attempt: AuthAttempt; accepted?: boolean; sessionEmail?: string | null },
  { ok: boolean }
>({
  name: 'expectsAuthAttempt',
  description: 'expects an auth call to have been accepted and its session',
  template: 'expects the attempt to be accepted: {accepted}',
  default: async (_services, { attempt, accepted, sessionEmail }) => {
    if (accepted !== undefined && attempt.ok !== accepted) {
      throw new Error(
        `Expected the call to be ${accepted ? 'accepted' : 'refused'}, got ${
          attempt.error ?? 'no error'
        }`
      )
    }
    if (sessionEmail === null && attempt.sessionEmail !== undefined) {
      throw new Error(
        `Expected no session, got one for ${attempt.sessionEmail}`
      )
    }
    if (
      typeof sessionEmail === 'string' &&
      attempt.sessionEmail !== sessionEmail
    ) {
      throw new Error(
        `Expected the session to be ${sessionEmail}, got ${attempt.sessionEmail ?? 'none'}`
      )
    }
    return { ok: attempt.ok }
  },
})
