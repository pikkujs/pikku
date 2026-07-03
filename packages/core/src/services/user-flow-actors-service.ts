import type {
  ConverseOptions,
  ActorFlowVerdict,
} from '../wirings/actor-flow/actor-flow.types.js'

/**
 * A user-flow actor: a synthetic user (a normal user row flagged `actor`) that
 * workflow steps can run as. Passed to `workflow.do(step, rpc, data, { actor })`
 * — the step then goes through the actor's authenticated client over the REAL
 * transport (auth middleware, permissions, serialization all exercised),
 * never through internal dispatch. Login is lazy: the first `invoke` signs the
 * actor in and the session is cached for the actor's lifetime.
 */
export interface UserFlowActor<TAgentName extends string = string> {
  /** Stable actor name (the key in pikku.config.json's actor registry). */
  readonly name: string
  /** The actor's user email — flows use it for invites/lookups. */
  readonly email: string
  /** Invoke an exposed RPC as this actor over the real transport. */
  invoke(rpcName: string, data: unknown): Promise<unknown>
  /**
   * Hold a dynamic conversation with a target Pikku AI agent, in THIS actor's
   * persona (personality/jobTitle). Drives the target over the real transport
   * as the signed-in actor, answers its tool-approval requests in-persona, and
   * returns the actor's verdict on whether the task was met. Deterministic
   * checks are the caller's job — use `invoke` afterwards. In a typed project
   * `agent` is constrained to the generated union of agent names.
   */
  converse(options: ConverseOptions<TAgentName>): Promise<ActorFlowVerdict>
}

/**
 * Display/config metadata for an actor (from pikku.config.json). The email
 * identifies the actor's user row; personality/jobTitle exist for the console
 * screen and for agent-driven flows (the agent plays the persona).
 */
export interface UserFlowActorConfig {
  email: string
  name?: string
  jobTitle?: string
  personality?: string
}

/** The injected `actors` service: actor name → actor. */
export type UserFlowActors = Record<string, UserFlowActor>
