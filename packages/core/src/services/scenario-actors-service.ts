import type {
  ConverseOptions,
  ActorFlowVerdict,
} from '../wirings/actor-flow/actor-flow.types.js'

/** What the transport answered, for a step that treats the status as data. */
export interface ScenarioRpcResponse {
  status: number
  ok: boolean
  /** The parsed JSON body, or undefined for an empty response. */
  body: unknown
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
  ): Promise<ScenarioRpcResponse>
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
