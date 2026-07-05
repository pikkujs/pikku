import type {
  ConverseOptions,
  ActorFlowVerdict,
} from '../wirings/actor-flow/actor-flow.types.js'

/** A synthetic user (a user row flagged `actor`) that workflow steps run as over the real transport */
export interface ScenarioActor<TAgentName extends string = string> {
  /** Stable actor name (the key in pikku.config.json's actor registry). */
  readonly name: string
  /** The actor's user email — flows use it for invites/lookups. */
  readonly email: string
  /** Invoke an exposed RPC as this actor over the real transport. */
  invoke(rpcName: string, data: unknown): Promise<unknown>
  /** Converse with a Pikku AI agent in this actor's persona and return its verdict */
  converse(options: ConverseOptions<TAgentName>): Promise<ActorFlowVerdict>
}

/** Display/config metadata for an actor (from pikku.config.json) */
export interface ScenarioActorConfig {
  email: string
  name?: string
  jobTitle?: string
  personality?: string
}

/** The injected `actors` service: actor name → actor. */
export type ScenarioActors = Record<string, ScenarioActor>
