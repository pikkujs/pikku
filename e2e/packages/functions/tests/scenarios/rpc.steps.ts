/**
 * The shared RPC vocabulary for the server-only scenarios.
 *
 * Most of Wave 2 needs no step at all — `scenario.do(name, 'rpcName', data,
 * { actor })` already invokes an exposed RPC over the real transport as an
 * actor, typed. These exist for the cases that one cannot express:
 *
 * - a call whose STATUS is the assertion. `invoke` throws on a non-2xx and
 *   truncates the body that names which scope was missing, so a refusal has to
 *   go through `invokeRaw`.
 * - a call carrying an extra header — impersonation, or one of the header-shim
 *   principals the credential scenarios invent.
 *
 * The step target is a static literal and the RPC name it dispatches is
 * ordinary step data, which is what keeps it PKU678-clean.
 */
import { pikkuScenarioStep } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { requireActor, type ScenarioHttpResponse } from '@pikku/core/workflow'
import { describeValue } from './support.js'

export const invokesRpcRaw = pikkuScenarioStep<
  {
    rpcName: string
    data?: unknown
    headers?: Record<string, string>
  },
  ScenarioHttpResponse
>({
  name: 'invokesRpcRaw',
  description: 'invokes an RPC and reports what the transport answered',
  template: 'invokes {rpcName}',
  default: async (_services, { rpcName, data, headers }, { scenarioStep }) => {
    const actor = requireActor(scenarioStep)
    const response = await actor.invokeRaw(
      rpcName as never,
      (data ?? null) as never,
      headers ? { headers } : undefined
    )
    return { ...response, body: response.body ?? null }
  },
})

/**
 * The outcome of a raw RPC call.
 *
 * `contains` searches the serialized body rather than a named field, because a
 * refusal's shape is the error's business: what a scenario asserts is that the
 * caller was told which scope was missing, not where in the envelope it sat.
 */
export const expectsRpcResponse = pikkuScenarioStep<
  {
    call: ScenarioHttpResponse
    status?: number
    contains?: string[]
    doesNotContain?: string[]
  },
  { status: number }
>({
  name: 'expectsRpcResponse',
  description: 'expects the status and body of a raw RPC call',
  template: 'expects status {status}',
  default: async (_services, { call, status, contains, doesNotContain }) => {
    if (status !== undefined && call.status !== status) {
      throw new Error(
        `Expected status ${status}, got ${call.status}: ${call.serialized}`
      )
    }
    for (const needle of contains ?? []) {
      if (!call.serialized.includes(needle)) {
        throw new Error(
          `Expected the response to contain ${describeValue(needle)}, got ${call.serialized}`
        )
      }
    }
    for (const needle of doesNotContain ?? []) {
      if (call.serialized.includes(needle)) {
        throw new Error(
          `Expected the response NOT to contain ${describeValue(needle)}, got ${call.serialized}`
        )
      }
    }
    return { status: call.status }
  },
})

/**
 * Resolves a seeded person's Better Auth id from their email, through the
 * directory the console itself reads.
 *
 * Only works for people: `pikkuAdminListUsers` filters out rows flagged
 * `actor: true`, so an ACTOR's own id comes from `readsActorUserId` instead.
 * The caller needs `admin:users:list`.
 */
export const readsUserIdByEmail = pikkuScenarioStep<
  { email: string },
  { userId: string }
>({
  name: 'readsUserIdByEmail',
  description: 'resolves a seeded user id from an email via the directory',
  template: 'resolves {email}',
  default: async (_services, { email }, { scenarioStep }) => {
    const actor = requireActor(scenarioStep)
    const directory = (await actor.invoke(
      'pikkuAdminListUsers' as never,
      {
        limit: 100,
      } as never
    )) as { users?: { id: string; email: string }[] }
    const found = (directory.users ?? []).find((user) => user.email === email)
    if (!found) {
      throw new Error(
        `No user with email ${email}, the directory holds ${describeValue(
          (directory.users ?? []).map((user) => user.email)
        )}`
      )
    }
    return { userId: found.id }
  },
})

/**
 * Asks the server which user the acting actor actually is.
 *
 * Better Auth owns the user table, so ids are only knowable at runtime, and an
 * impersonation header or a direct scope grant is keyed by id. The directory
 * cannot answer this: `pikkuAdminListUsers` deliberately filters out rows
 * flagged `actor: true`, because a scenario actor is not a person a human picks
 * from. Asking the session itself is both the supported route and the honest
 * one — it reports the identity the request really ran under.
 */
export const readsActorUserId = pikkuScenarioStep<void, { userId: string }>({
  name: 'readsActorUserId',
  description: 'reads the user id of the acting actor from its own session',
  template: 'reads its own user id',
  default: async (_services, _data, { scenarioStep }) => {
    const actor = requireActor(scenarioStep)
    const session = (await actor.invoke('whoAmI' as never, null as never)) as {
      userId?: string
    }
    if (!session.userId) {
      throw new Error(
        `The session reported no user id: ${describeValue(session)}. The actor is signed out.`
      )
    }
    return { userId: session.userId }
  },
})

/**
 * The caller cleared an authorization gate.
 *
 * Deliberately weaker than a 200: what is under test is the gate, not the
 * function body, so any non-403 below 500 counts — a domain error from the
 * function that ran is a pass, an authorization refusal is not.
 */
export const expectsRpcAllowed = pikkuScenarioStep<
  { call: ScenarioHttpResponse },
  { status: number }
>({
  name: 'expectsRpcAllowed',
  description: 'expects a call to have cleared the authorization gate',
  template: 'expects the call to be allowed',
  default: async (_services, { call }) => {
    if (call.status === 403) {
      throw new Error(`Expected the call to be allowed, got ${call.serialized}`)
    }
    if (call.status >= 500) {
      throw new Error(
        `Expected the call to be allowed, the server failed with ${call.status}: ${call.serialized}`
      )
    }
    return { status: call.status }
  },
})

/**
 * The response body is a collection.
 *
 * The console's list RPCs answer with a bare array, so there is no field to
 * name — what a scenario asserts is that a collection came back at all, and
 * sometimes that it is not empty.
 */
export const expectsRpcCollection = pikkuScenarioStep<
  { call: ScenarioHttpResponse; minLength?: number },
  { length: number }
>({
  name: 'expectsRpcCollection',
  description: 'expects the response body to be an array',
  template: 'expects a collection',
  default: async (_services, { call, minLength }) => {
    if (!Array.isArray(call.body)) {
      throw new Error(`Expected an array, got ${call.serialized}`)
    }
    if (minLength !== undefined && call.body.length < minLength) {
      throw new Error(
        `Expected at least ${minLength} entries, got ${call.body.length}`
      )
    }
    return { length: call.body.length }
  },
})

/**
 * The response body is a record carrying at least one of the named keys.
 *
 * `anyOf` rather than a single key because a run's identifier is reported as
 * `id` by some readers and `runId` by others, and which one is the reader's
 * business, not the scenario's.
 */
export const expectsRpcRecord = pikkuScenarioStep<
  { call: ScenarioHttpResponse; anyOf?: string[] },
  { keys: string[] }
>({
  name: 'expectsRpcRecord',
  description: 'expects the response body to be a record',
  template: 'expects a record',
  default: async (_services, { call, anyOf }) => {
    if (
      call.body === null ||
      typeof call.body !== 'object' ||
      Array.isArray(call.body)
    ) {
      throw new Error(`Expected a record, got ${call.serialized}`)
    }
    const record = call.body as Record<string, unknown>
    if (anyOf && !anyOf.some((name) => record[name] !== undefined)) {
      throw new Error(
        `Expected one of ${anyOf.join(', ')} to be present, got ${call.serialized}`
      )
    }
    return { keys: Object.keys(record) }
  },
})
