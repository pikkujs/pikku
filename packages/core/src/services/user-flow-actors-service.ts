/**
 * A user-flow actor: a synthetic user (a normal user row flagged `actor`) that
 * workflow steps can run as. Passed to `workflow.do(step, rpc, data, { actor })`
 * — the step then goes through the actor's authenticated client over the REAL
 * transport (auth middleware, permissions, serialization all exercised),
 * never through internal dispatch. Login is lazy: the first `invoke` signs the
 * actor in and the session is cached for the actor's lifetime.
 */
export interface UserFlowActor {
  /** Stable actor name (the key in pikku.config.json's actor registry). */
  readonly name: string
  /** Invoke an exposed RPC as this actor over the real transport. */
  invoke(rpcName: string, data: unknown): Promise<unknown>
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
