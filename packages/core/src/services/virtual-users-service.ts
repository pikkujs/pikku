import type {
  ConverseOptions,
  ConversationVerdict,
} from '../wirings/virtual-user-conversation/virtual-user-conversation.types.js'
import type { VirtualUserMeta } from '../wirings/virtual-user/virtual-user-declaration.types.js'

/**
 * What the transport answered, for a step that treats the status as data.
 *
 * An HTTP response with its body already drained: the stream can only be read
 * once, and a step's return value crosses into the run record, so the response
 * object itself cannot travel. This is the shape every caller ends up with.
 */
export interface ScenarioHttpResponse<T = unknown> {
  status: number
  ok: boolean
  /**
   * The parsed JSON body — or, when the body was not JSON, the raw text it was
   * parsed from, so an HTML error page is still readable rather than lost.
   * `undefined` for an empty response.
   *
   * `T` is a claim the caller makes, not one the transport checked: a step that
   * knows the route's payload names it here instead of casting at every use.
   */
  body: T
  /**
   * The whole body as text, so an assertion can search it without knowing the
   * payload's shape — and so an error body that is HTML rather than JSON still
   * says what went wrong.
   */
  serialized: string
}

/**
 * Drain a response into the shape a step can carry: the parsed body (an empty
 * one counting as no body at all) alongside the text it was parsed from.
 *
 * `invokeRaw` returns this, and a step that has to reach past a virtual user — a
 * route with no RPC, an identity no virtual user can hold — reaches for this rather
 * than writing the same record by hand.
 *
 * @example snippet: scenarioPolling
 */
export const readScenarioHttpResponse = async <T = unknown>(
  res: Response
): Promise<ScenarioHttpResponse<T>> => {
  const text = res.status === 204 ? '' : await res.text().catch(() => '')
  return {
    status: res.status,
    ok: res.ok,
    body: (text ? parseJsonBody(text) : undefined) as T,
    serialized: text,
  }
}

const parseJsonBody = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** How to send one JSON request, for `postScenarioJson`. */
export interface ScenarioJsonRequest {
  /** Serialised as the JSON body. Omit for a request that carries none. */
  body?: unknown
  /** Sent alongside `content-type: application/json`, and may override it. */
  headers?: Record<string, string>
  /** Defaults to `POST` — the method every scenario route here answers. */
  method?: string
  /**
   * The `fetch` to send it with. Pass a `ScenarioCookieJar`'s to keep the
   * session; the global `fetch` otherwise, which is what a step asserting on a
   * sessionless call wants.
   */
  fetch?: typeof fetch
}

/**
 * POST JSON somewhere and report what came back, without throwing on a 4xx/5xx.
 *
 * Every scenario that reaches past a virtual user was writing this by hand — the same
 * `content-type`, the same `JSON.stringify`, the same drain — and the copies had
 * drifted: some returned `res.json()`, which loses the status and throws
 * outright when the target answers an empty body or an HTML error page. A
 * refusal is the expected outcome of a permissions scenario, so it has to
 * survive as data.
 *
 * @example snippet: scenarioHttpStep
 */
export const postScenarioJson = async <T = unknown>(
  url: string,
  {
    body,
    headers,
    method = 'POST',
    fetch: send = fetch,
  }: ScenarioJsonRequest = {}
): Promise<ScenarioHttpResponse<T>> =>
  readScenarioHttpResponse<T>(
    await send(url, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  )

/** Per-call transport options. */
export interface ScenarioInvokeOptions {
  /**
   * Headers to send alongside the virtual user's own session. This is how a step
   * expresses an identity no declared virtual user can — an impersonation header, or
   * one of the header-shim principals a credential scenario invents.
   */
  headers?: Record<string, string>
}

/**
 * The RPC surface a virtual user can reach, as name → input/output. A project binds
 * its generated exposed RPC map here; the default leaves every name open, which
 * is what a virtual user built by hand (or by a third-party driver) gets.
 */
export type ScenarioRpcMap = Record<string, { input: any; output: any }>

/**
 * The virtual user a step's `virtualUser` slot carries, for a project whose virtual users are
 * known. No declared virtual users keeps the open type rather than collapsing to
 * `never` — a project may still build one itself.
 */
export type ScenarioVirtualUserOf<TVirtualUsers> = [
  keyof TVirtualUsers,
] extends [never]
  ? ScenarioVirtualUser
  : TVirtualUsers[keyof TVirtualUsers]

/**
 * A declared person, signed in and acting over the real transport.
 *
 * The runtime half of `defineVirtualUsers()`: sign-in materialises a user row
 * flagged `virtualUser: true`, and everything a step or a virtual user does goes
 * through here.
 */
export interface ScenarioVirtualUser<
  TAgentName extends string = string,
  TRpcMap extends ScenarioRpcMap = ScenarioRpcMap,
> {
  /** The id it was declared under — what a step's `virtualUser` slot names. */
  readonly name: string
  /** Their address, computed from the id. Flows use it for invites/lookups. */
  readonly email: string
  /** Invoke an exposed RPC as this person over the real transport. */
  invoke<TName extends keyof TRpcMap & string>(
    rpcName: TName,
    data: TRpcMap[TName]['input']
  ): Promise<TRpcMap[TName]['output']>
  /**
   * The same call, reporting what the transport answered rather than throwing.
   * A refusal is the expected outcome of a permissions or scopes scenario, and
   * `invoke`'s error truncates the body that names which scope was missing.
   */
  invokeRaw<TName extends keyof TRpcMap & string>(
    rpcName: TName,
    data: TRpcMap[TName]['input'],
    options?: ScenarioInvokeOptions
  ): Promise<ScenarioHttpResponse>
  /** Converse with a Pikku AI agent in character and return its verdict. */
  converse(options: ConverseOptions<TAgentName>): Promise<ConversationVerdict>
  /**
   * The roles this person actually holds on the stage, read back after signing
   * in — what a run compares against the declaration before its first step.
   *
   * `null` when the target does not say. That is not the same as "no roles": a
   * run that treats silence as an empty list refuses to start against every
   * stage whose auth reports roles somewhere else, so the caller must decide
   * whether it can verify at all.
   */
  sessionRoles(): Promise<string[] | null>
}

/**
 * A declared virtual user with its address filled in — what codegen writes and what
 * a seed, a scenario run and a virtual-user run all read.
 *
 * The address is not declared. It is derived from the virtual user's id and the
 * project's virtual user domain, so two people can never accidentally share one and
 * sign in as the same user row — which would silently collapse exactly the
 * isolation scenarios a second person exists for.
 */
export type ResolvedVirtualUser = VirtualUserMeta & { email: string }

/** The injected `virtualUsers` service: virtual user id → virtual user. */
export type ScenarioVirtualUsers = Record<string, ScenarioVirtualUser>
