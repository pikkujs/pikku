import type {
  ConverseOptions,
  ActorFlowVerdict,
} from '../wirings/actor-flow/actor-flow.types.js'

/**
 * What the transport answered, for a step that treats the status as data.
 *
 * An HTTP response with its body already drained: the stream can only be read
 * once, and a step's return value crosses into the run record, so the response
 * object itself cannot travel. This is the shape every caller ends up with.
 */
export interface ScenarioHttpResponse {
  status: number
  ok: boolean
  /** The parsed JSON body, or undefined for an empty response. */
  body: unknown
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
 * `invokeRaw` returns this, and a step that has to reach past an actor — a
 * route with no RPC, an identity no actor can hold — reaches for this rather
 * than writing the same record by hand.
 */
export const readScenarioHttpResponse = async (
  res: Response
): Promise<ScenarioHttpResponse> => {
  const text = res.status === 204 ? '' : await res.text().catch(() => '')
  return {
    status: res.status,
    ok: res.ok,
    body: text ? parseJsonBody(text) : undefined,
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

/** Per-call transport options. */
export interface ScenarioInvokeOptions {
  /**
   * Headers to send alongside the actor's own session. This is how a step
   * expresses an identity the actor registry cannot — an impersonation header,
   * or one of the header-shim principals a credential scenario invents.
   */
  headers?: Record<string, string>
}

/**
 * The RPC surface an actor can reach, as name → input/output. A project binds
 * its generated exposed RPC map here; the default leaves every name open, which
 * is what an actor built by hand (or by a third-party driver) gets.
 */
export type ScenarioRpcMap = Record<string, { input: any; output: any }>

/**
 * The actor a step wire carries, for a project whose actor registry is known.
 * An empty registry keeps the open actor type rather than collapsing to
 * `never` — a project may still build actors itself.
 */
export type ScenarioActorOf<TActors> = [keyof TActors] extends [never]
  ? ScenarioActor
  : TActors[keyof TActors]

/** A synthetic user (a user row flagged `actor`) that workflow steps run as over the real transport */
export interface ScenarioActor<
  TAgentName extends string = string,
  TRpcMap extends ScenarioRpcMap = ScenarioRpcMap,
> {
  /** Stable actor name (the key in pikku.config.json's actor registry). */
  readonly name: string
  /** The actor's user email — flows use it for invites/lookups. */
  readonly email: string
  /** Invoke an exposed RPC as this actor over the real transport. */
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
  /** Converse with a Pikku AI agent in this actor's persona and return its verdict */
  converse(options: ConverseOptions<TAgentName>): Promise<ActorFlowVerdict>
}

/** Display/config metadata for an actor (from pikku.config.json) */
export interface ScenarioActorConfig {
  email: string
  name?: string
  jobTitle?: string
  personality?: string
  /**
   * The persona this body is one of — the KIND of person, declared in
   * `scenarios.personas`. Most personas have exactly one actor and it is
   * materialised for them; a second body of the same persona is what tenant
   * isolation and peer-sharing scenarios are made of.
   */
  persona?: string
  /**
   * Scopes this actor holds, granted directly rather than through a role, and
   * the roles it belongs to. Pikku carries them; it never applies them — which
   * scope store exists and which roles have been created is the app's own, so
   * the app's seed reads these back off `scenarioActorConfigs` and grants them.
   */
  scopes?: readonly string[]
  roles?: readonly string[]
}

/** The injected `actors` service: actor name → actor. */
export type ScenarioActors = Record<string, ScenarioActor>
