/**
 * Per-user OAuth2 credentials through Better Auth account linking.
 *
 * A `defineCredential({ type: 'wire', oauth2 })` is registered as a Better Auth
 * genericOAuth provider whose providerId is the credential name, so linking an
 * account is what makes `credentialService.get(name, userId)` resolve.
 *
 * Every step signs the user in again from the credentials the sign-up step
 * returned, because a cookie jar cannot survive as a JSON step result. That is
 * not a workaround: it is also what proves the link is durable server-side
 * rather than living in one session.
 */
import { pikkuScenarioStep } from '#pikku/scenarios/pikku-scenario-types.gen.js'
import { createAuthClient } from 'better-auth/client'
import { createCookieJar, requireScenarioEnv } from '@pikku/core/scenario'

export interface LinkUser {
  name: string
  email: string
  password: string
  /** The real Better Auth id, which is what the credential is keyed by. */
  userId: string
}

const PASSWORD = 'e2e-password'

const sessionFor = async (apiUrl: string, user: LinkUser) => {
  const { fetch: cookieFetch } = createCookieJar(apiUrl)
  const client = createAuthClient({
    baseURL: apiUrl,
    fetchOptions: { customFetchImpl: cookieFetch },
  })
  const { error } = await client.signIn.email({
    email: user.email,
    password: user.password,
  })
  if (error) {
    throw new Error(`Sign-in failed for ${user.name}: ${JSON.stringify(error)}`)
  }
  return { client, cookieFetch }
}

const requestLink = (
  apiUrl: string,
  cookieFetch: typeof fetch,
  providerId: string
) =>
  cookieFetch(`${apiUrl}/api/auth/credential-oauth/link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ providerId, callbackURL: apiUrl }),
  })

/**
 * Signs a brand new user up and reports the identity every later step needs.
 *
 * Better Auth persists its tables for the server's lifetime and there is no
 * reset, so the email is made unique inside the step — which also keeps it a
 * durable, replayable step result rather than nondeterminism in a scenario.
 *
 * The suite's auth config lets the user NAMED `root` connect a platform-wide
 * credential (see `canLinkSingleton` in `packages/functions/src/auth.ts`), so
 * the name is meaningful, not decoration.
 */
export const signsUpLinkUser = pikkuScenarioStep<{ name: string }, LinkUser>({
  name: 'signsUpLinkUser',
  description: 'signs a new user up and reports their Better Auth id',
  template: 'signs {name} up',
  default: async (_services, { name }, { scenarioStep }) => {
    const apiUrl = requireScenarioEnv(scenarioStep).apiUrl
    const client = createAuthClient({
      baseURL: apiUrl,
      fetchOptions: { customFetchImpl: createCookieJar(apiUrl).fetch },
    })
    const email = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
    const { data, error } = await client.signUp.email({
      name,
      email,
      password: PASSWORD,
    })
    if (error || !data?.user?.id) {
      throw new Error(`Sign-up failed for ${name}: ${JSON.stringify(error)}`)
    }
    return { name, email, password: PASSWORD, userId: data.user.id }
  },
})

export interface LinkStartResult {
  status: number
  url?: string
  scopes?: string
}

/**
 * Asks Better Auth to start the link and reports where it would send the user.
 *
 * A refusal is data, not a throw: the singleton scenarios assert the 403 the
 * gate raises before any state is generated.
 */
export const startsProviderLink = pikkuScenarioStep<
  { user: LinkUser; providerId: string },
  LinkStartResult
>({
  name: 'startsProviderLink',
  description: 'starts an OAuth link and reports its redirect target',
  template: 'starts linking {providerId}',
  default: async (_services, { user, providerId }, { scenarioStep }) => {
    const apiUrl = requireScenarioEnv(scenarioStep).apiUrl
    const { cookieFetch } = await sessionFor(apiUrl, user)
    const response = await requestLink(apiUrl, cookieFetch, providerId)
    if (!response.ok) {
      return { status: response.status }
    }
    const body = (await response.json()) as { url?: string }
    return {
      status: response.status,
      url: body.url,
      scopes: body.url
        ? (new URL(body.url).searchParams.get('scope') ?? undefined)
        : undefined,
    }
  },
})

/**
 * Walks the whole three-hop link: start, the mock provider's auto-approving
 * redirect, and Better Auth's callback. All three share one cookie jar because
 * the callback matches the state cookie the start set.
 */
export const linksProvider = pikkuScenarioStep<
  { user: LinkUser; providerId: string },
  { linked: true }
>({
  name: 'linksProvider',
  description: 'links an OAuth provider end to end through the mock provider',
  template: 'links {providerId}',
  default: async (_services, { user, providerId }, { scenarioStep }) => {
    const apiUrl = requireScenarioEnv(scenarioStep).apiUrl
    const { cookieFetch } = await sessionFor(apiUrl, user)
    const start = await requestLink(apiUrl, cookieFetch, providerId)
    const started = (await start.json()) as { url?: string }
    if (!start.ok || !started.url) {
      throw new Error(
        `Linking ${providerId} was refused with ${start.status}: ${JSON.stringify(started)}`
      )
    }
    const authorize = await cookieFetch(started.url, { redirect: 'manual' })
    const callbackUrl = authorize.headers.get('location')
    if (!callbackUrl) {
      throw new Error('The mock provider did not redirect back')
    }
    const callback = await cookieFetch(callbackUrl, { redirect: 'manual' })
    if (callback.status >= 400) {
      throw new Error(`The link callback failed with ${callback.status}`)
    }
    return { linked: true }
  },
})

export const unlinksProvider = pikkuScenarioStep<
  { user: LinkUser; providerId: string },
  { unlinked: true }
>({
  name: 'unlinksProvider',
  description: "unlinks a provider through the user's own session",
  template: 'unlinks {providerId}',
  default: async (_services, { user, providerId }, { scenarioStep }) => {
    const { client } = await sessionFor(
      requireScenarioEnv(scenarioStep).apiUrl,
      user
    )
    const { error } = await client.unlinkAccount({ providerId })
    if (error) {
      throw new Error(
        `Unlinking ${providerId} failed: ${JSON.stringify(error)}`
      )
    }
    return { unlinked: true }
  },
})

export const readsLinkedProviders = pikkuScenarioStep<
  { user: LinkUser },
  { providers: string[] }
>({
  name: 'readsLinkedProviders',
  description: 'reads the providers currently linked to a user',
  template: 'reads the linked providers',
  default: async (_services, { user }, { scenarioStep }) => {
    const { client } = await sessionFor(
      requireScenarioEnv(scenarioStep).apiUrl,
      user
    )
    const { data } = await client.listAccounts()
    return { providers: (data ?? []).map((account) => account.providerId) }
  },
})

export const expectsLinkedProviders = pikkuScenarioStep<
  { linked: { providers: string[] }; contains?: string; excludes?: string },
  { count: number }
>({
  name: 'expectsLinkedProviders',
  description: 'expects a provider to be linked, or not to be',
  template: 'expects the linked providers',
  default: async (_services, { linked, contains, excludes }) => {
    if (contains !== undefined && !linked.providers.includes(contains)) {
      throw new Error(
        `Expected ${contains} to be linked, got ${linked.providers.join(', ') || 'nothing'}`
      )
    }
    if (excludes !== undefined && linked.providers.includes(excludes)) {
      throw new Error(`Expected ${excludes} not to be linked`)
    }
    return { count: linked.providers.length }
  },
})

export const expectsLinkStart = pikkuScenarioStep<
  {
    start: LinkStartResult
    status?: number
    urlContains?: string
    scopes?: string[]
  },
  { status: number }
>({
  name: 'expectsLinkStart',
  description: 'expects a link start to have been allowed or refused',
  template: 'expects the link start to answer {status}',
  default: async (_services, { start, status, urlContains, scopes }) => {
    if (status !== undefined && start.status !== status) {
      throw new Error(
        `Expected the link start to answer ${status}, got ${start.status}`
      )
    }
    if (urlContains !== undefined && !start.url?.includes(urlContains)) {
      throw new Error(
        `Expected the redirect to target ${urlContains}, got ${start.url ?? 'nothing'}`
      )
    }
    for (const scope of scopes ?? []) {
      if (!start.scopes?.includes(scope)) {
        throw new Error(
          `Expected the redirect to carry the ${scope} scope, got ${start.scopes ?? 'none'}`
        )
      }
    }
    return { status: start.status }
  },
})
