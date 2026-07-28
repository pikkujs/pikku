/**
 * The credential service seen from outside: the CRUD RPCs, the HMAC addon that
 * consumes a wire credential, and the OAuth addon that gates on a per-user one.
 *
 * These RPCs are deliberately unauthenticated and take the owning `userId` as
 * ordinary data — the suite invents principals (`user-1`, `lazy-user`) that have
 * no user row at all, which is the point: the header shim in `src/middleware.ts`
 * is what is under test, so an actor cannot stand in for them.
 */
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { postScenarioJson, requireScenarioEnv } from '@pikku/core/workflow'

/**
 * Calls one of the suite's unauthenticated credential RPCs and answers with its
 * payload.
 *
 * These RPCs are setup, not the assertion — a scenario asserts on what the HMAC
 * or OAuth addon then does with the credential — so a non-2xx here is a broken
 * fixture and says so, rather than surfacing three steps later as a missing
 * field.
 */
const callRpc = async <T>(
  apiUrl: string,
  rpcName: string,
  data: Record<string, unknown>
): Promise<T> => {
  const response = await postScenarioJson<T>(`${apiUrl}/rpc/${rpcName}`, {
    body: { data },
  })
  if (!response.ok) {
    throw new Error(
      `[scenario] '${rpcName}' answered ${response.status}: ${response.serialized.slice(0, 300)}`
    )
  }
  return response.body
}

/**
 * Clears every credential.
 *
 * The gherkin ran this as a `Background`, once per scenario. It stays an
 * explicit opening step rather than a `before` hook: the runner has no state
 * reset of its own, so a scenario that depends on starting empty should say so
 * on its ladder.
 */
export const resetsCredentials = pikkuScenarioStep<void, { reset: true }>({
  name: 'resetsCredentials',
  description: 'clears every stored credential',
  template: 'resets the credentials',
  func: async (_services, _data, { scenarioStep }) => {
    await callRpc<unknown>(
      requireScenarioEnv(scenarioStep).apiUrl,
      'resetCredentials',
      {}
    )
    return { reset: true }
  },
})

export const setsCredential = pikkuScenarioStep<
  { name: string; value: Record<string, unknown>; userId?: string },
  { name: string }
>({
  name: 'setsCredential',
  description: 'stores a credential, globally or for one user',
  template: 'sets the {name} credential',
  func: async (_services, { name, value, userId }, { scenarioStep }) => {
    await callRpc(requireScenarioEnv(scenarioStep).apiUrl, 'setCredential', {
      name,
      valueJson: JSON.stringify(value),
      ...(userId ? { userId } : {}),
    })
    return { name }
  },
})

export interface CredentialRead {
  name: string
  exists: boolean
  /** The stored value, or null when nothing resolves. */
  value: Record<string, unknown> | null
}

export const readsCredential = pikkuScenarioStep<
  { name: string; userId?: string },
  CredentialRead
>({
  name: 'readsCredential',
  description: 'reads a credential through the service addons resolve through',
  template: 'reads the {name} credential',
  func: async (_services, { name, userId }, { scenarioStep }) => {
    const data = { name, ...(userId ? { userId } : {}) }
    const result = await callRpc<{ valueJson?: string | null }>(
      requireScenarioEnv(scenarioStep).apiUrl,
      'getCredential',
      data
    )
    const valueJson = result?.valueJson ?? null
    return {
      name,
      exists: valueJson !== null,
      value: valueJson === null ? null : JSON.parse(valueJson),
    }
  },
})

export const deletesCredential = pikkuScenarioStep<
  { name: string; userId?: string },
  { success: boolean }
>({
  name: 'deletesCredential',
  description: 'revokes a credential server-side, with no session anywhere',
  template: 'deletes the {name} credential',
  func: async (_services, { name, userId }, { scenarioStep }) => {
    const result = await callRpc<{ success?: boolean }>(
      requireScenarioEnv(scenarioStep).apiUrl,
      'deleteCredential',
      {
        name,
        ...(userId ? { userId } : {}),
      }
    )
    if (result?.success !== true) {
      throw new Error(
        `Deleting ${name} did not report success: ${JSON.stringify(result)}`
      )
    }
    return { success: true }
  },
})

export const readsAllCredentials = pikkuScenarioStep<
  { userId: string },
  { count: number; credentials: Record<string, unknown> }
>({
  name: 'readsAllCredentials',
  description: 'reads every credential belonging to one user',
  template: 'reads every credential of {userId}',
  func: async (_services, { userId }, { scenarioStep }) => {
    const result = await callRpc<{ credentialsJson: string }>(
      requireScenarioEnv(scenarioStep).apiUrl,
      'getAllCredentials',
      { userId }
    )
    const credentials = JSON.parse(result.credentialsJson)
    return { count: Object.keys(credentials).length, credentials }
  },
})

export const expectsCredential = pikkuScenarioStep<
  { credential: CredentialRead; exists?: boolean; value?: unknown },
  { exists: boolean }
>({
  name: 'expectsCredential',
  description: 'expects a credential to resolve, and optionally to a value',
  template: 'expects the credential to exist: {exists}',
  func: async (_services, { credential, exists, value }) => {
    if (exists !== undefined && credential.exists !== exists) {
      throw new Error(
        `Expected ${credential.name} to ${exists ? 'resolve' : 'not resolve'}, got ${JSON.stringify(credential.value)}`
      )
    }
    if (
      value !== undefined &&
      JSON.stringify(credential.value) !== JSON.stringify(value)
    ) {
      throw new Error(
        `Expected ${credential.name} to be ${JSON.stringify(value)}, got ${JSON.stringify(credential.value)}`
      )
    }
    return { exists: credential.exists }
  },
})

export const expectsCredentials = pikkuScenarioStep<
  {
    all: { count: number; credentials: Record<string, unknown> }
    count?: number
    values?: Record<string, unknown>
  },
  { count: number }
>({
  name: 'expectsCredentials',
  description: "expects a user's credentials to be the given set",
  template: 'expects {count} credential(s)',
  func: async (_services, { all, count, values }) => {
    if (count !== undefined && all.count !== count) {
      throw new Error(`Expected ${count} credential(s), got ${all.count}`)
    }
    for (const [name, want] of Object.entries(values ?? {})) {
      const got = all.credentials[name]
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        throw new Error(
          `Expected ${name} to be ${JSON.stringify(want)}, got ${JSON.stringify(got)}`
        )
      }
    }
    return { count: all.count }
  },
})

export interface SignResult {
  ok: boolean
  status: number
  signature?: string
  error?: string
}

/**
 * Signs through the HMAC addon.
 *
 * `credential` names the credential to load explicitly (the `x-credentials`
 * header); `userId` instead lets the addon lazy-load whatever that principal
 * owns. Passing neither is what the "fails without credentials" scenarios do.
 */
export const signsMessage = pikkuScenarioStep<
  { message: string; credential?: string; userId?: string },
  SignResult
>({
  name: 'signsMessage',
  description: 'signs a message through the HMAC addon',
  template: 'signs {message}',
  func: async (
    _services,
    { message, credential, userId },
    { scenarioStep }
  ) => {
    const headers: Record<string, string> = {}
    if (credential) {
      headers['x-credentials'] = credential
    }
    if (userId) {
      headers['x-user-id'] = userId
    }
    const { status, body } = await postScenarioJson<{
      message?: string
      signature?: string
    }>(`${requireScenarioEnv(scenarioStep).apiUrl}/api/hmac/sign`, {
      body: { message },
      headers,
    })
    if (status >= 400) {
      return { ok: false, status, error: body?.message ?? JSON.stringify(body) }
    }
    return { ok: true, status, signature: body.signature }
  },
})

export const verifiesMessage = pikkuScenarioStep<
  {
    message: string
    signature: string
    credential?: string
    userId?: string
  },
  { valid: boolean }
>({
  name: 'verifiesMessage',
  description: 'verifies a signature through the HMAC addon',
  template: 'verifies {message}',
  func: async (
    _services,
    { message, signature, credential, userId },
    { scenarioStep }
  ) => {
    const headers: Record<string, string> = {}
    if (credential) {
      headers['x-credentials'] = credential
    }
    if (userId) {
      headers['x-user-id'] = userId
    }
    const { body } = await postScenarioJson<{ valid?: boolean }>(
      `${requireScenarioEnv(scenarioStep).apiUrl}/api/hmac/verify`,
      { body: { message, signature }, headers }
    )
    return { valid: body.valid === true }
  },
})

export const expectsSignature = pikkuScenarioStep<
  {
    signed: SignResult
    accepted?: boolean
    error?: string
    differsFrom?: SignResult
  },
  { ok: boolean }
>({
  name: 'expectsSignature',
  description: 'expects a signing attempt to have been accepted or refused',
  template: 'expects the signing to be accepted: {accepted}',
  func: async (_services, { signed, accepted, error, differsFrom }) => {
    if (accepted !== undefined && signed.ok !== accepted) {
      throw new Error(
        `Expected signing to be ${accepted ? 'accepted' : 'refused'}, got ${signed.status}: ${signed.error ?? signed.signature}`
      )
    }
    if (accepted && !signed.signature) {
      throw new Error('Expected a non-empty signature')
    }
    if (error !== undefined && !signed.error?.includes(error)) {
      throw new Error(
        `Expected the failure to mention "${error}", got ${signed.error ?? 'no error'}`
      )
    }
    if (differsFrom && signed.signature === differsFrom.signature) {
      throw new Error('Expected the two signatures to differ')
    }
    return { ok: signed.ok }
  },
})

export const expectsVerification = pikkuScenarioStep<
  { verification: { valid: boolean }; valid: boolean },
  { valid: boolean }
>({
  name: 'expectsVerification',
  description: 'expects a signature check to have come out a given way',
  template: 'expects the verification to be valid: {valid}',
  func: async (_services, { verification, valid }) => {
    if (verification.valid !== valid) {
      throw new Error(
        `Expected the verification to be ${valid ? 'valid' : 'invalid'}`
      )
    }
    return { valid: verification.valid }
  },
})

export interface OAuthProfileResult {
  status: number
  authenticated: boolean
  hasToken: boolean
}

export const readsOAuthProfile = pikkuScenarioStep<
  { userId: string },
  OAuthProfileResult
>({
  name: 'readsOAuthProfile',
  description: 'calls the OAuth addon profile endpoint as a given principal',
  template: 'reads the OAuth profile as {userId}',
  func: async (_services, { userId }, { scenarioStep }) => {
    const { status, body } = await postScenarioJson<{
      authenticated?: boolean
      token?: string
    }>(`${requireScenarioEnv(scenarioStep).apiUrl}/api/oauth/profile`, {
      body: {},
      headers: { 'x-user-id': userId },
    })
    return {
      status,
      authenticated: body?.authenticated === true,
      hasToken: Boolean(body?.token),
    }
  },
})

export const expectsOAuthProfile = pikkuScenarioStep<
  { profile: OAuthProfileResult; status: number; authenticated?: boolean },
  { status: number }
>({
  name: 'expectsOAuthProfile',
  description: 'expects the OAuth addon to have allowed or refused the call',
  template: 'expects the OAuth profile to answer {status}',
  func: async (_services, { profile, status, authenticated }) => {
    if (profile.status !== status) {
      throw new Error(
        `Expected the OAuth profile to answer ${status}, got ${profile.status}`
      )
    }
    if (authenticated !== undefined) {
      if (profile.authenticated !== authenticated) {
        throw new Error(
          `Expected the profile to be ${authenticated ? 'authenticated' : 'unauthenticated'}`
        )
      }
      if (authenticated && !profile.hasToken) {
        throw new Error('Expected the profile to carry an access token')
      }
    }
    return { status: profile.status }
  },
})

export const expectsCredentialToken = pikkuScenarioStep<
  { credential: CredentialRead; contains: string },
  { found: true }
>({
  name: 'expectsCredentialToken',
  description: 'expects a resolved credential to carry a provider access token',
  template: 'expects the access token to contain {contains}',
  func: async (_services, { credential, contains }) => {
    const accessToken = (credential.value as { accessToken?: string } | null)
      ?.accessToken
    if (!accessToken?.includes(contains)) {
      throw new Error(
        `Expected an access token containing "${contains}", got ${accessToken ?? 'none'}`
      )
    }
    return { found: true }
  },
})
