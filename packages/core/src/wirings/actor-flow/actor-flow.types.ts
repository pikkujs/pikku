import type { UserFlowActor } from '../../services/user-flow-actors-service.js'

/**
 * How an actor agent answers the target agent's tool-approval requests during
 * the conversation.
 * - `'in-persona'` — the actor agent decides as the persona would (default).
 * - `'always'` — approve every request (stress the happy path).
 * - `'never'` — deny every request (exercise refusal handling).
 */
export type ActorFlowApprovalPolicy = 'in-persona' | 'always' | 'never'

/**
 * Context passed to an actor flow's deterministic `verify` hook, which runs
 * after the conversation completes. `actor` is the same authenticated RPC
 * client the persona used, so a verify can query the target environment (e.g.
 * confirm a row was created) and throw to fail the flow.
 */
export interface ActorFlowVerifyContext {
  actor: UserFlowActor
}

/**
 * An actor flow: an LLM-driven actor that plays a configured persona
 * (`pikku.config.json` → `userFlows.actors`), holds a real multi-turn
 * conversation with a target Pikku AI agent, answers the agent's tool-approval
 * requests in-persona, and evaluates whether the task was accomplished.
 *
 * Distinct from a user flow (deterministic actor RPC steps): it is
 * non-deterministic and LLM-driven, so it runs via `pikku actor run`, out of
 * the deterministic health-check path.
 */
export interface CoreActorFlow {
  /** The persona driving the conversation (from `actors` — a `UserFlowActor`). */
  actor: UserFlowActor
  /** Name of the target Pikku AI agent this actor converses with. */
  agent: string
  /** What the actor is trying to get the target agent to accomplish. */
  task: string
  /** How the actor answers the agent's tool-approval requests. Default `'in-persona'`. */
  approvals?: ActorFlowApprovalPolicy
  /** Natural-language success criterion the actor evaluates at the end (LLM verdict). */
  evaluate: string
  /** Deterministic assertion run after the conversation; throw to fail the flow. */
  verify?: (context: ActorFlowVerifyContext) => Promise<void> | void
  /** Display title. */
  title?: string
  /** Display description. */
  description?: string
  /** Organizational tags. */
  tags?: string[]
}

/**
 * The verdict an actor flow produces: the LLM self-evaluation, plus whether the
 * deterministic verify hook (if any) passed.
 */
export interface ActorFlowVerdict {
  /** Whether the actor judged the task met AND `verify` (if present) passed. */
  passed: boolean
  /** The actor's reasoning for its `evaluate` verdict. */
  reasoning: string
  /** Error message if the deterministic `verify` hook threw. */
  verifyError?: string
}

/**
 * Inspector/CLI metadata for a single actor flow.
 */
export interface ActorFlowMetaEntry {
  /** The exported name of the actor flow. */
  name: string
  /** Actor (persona) name this flow runs as. */
  actor: string
  /** Target Pikku AI agent name. */
  agent: string
  /** The task the actor pursues. */
  task: string
  /** The natural-language success criterion the actor evaluates. */
  evaluate: string
  /** Approval policy (defaults to `'in-persona'` when omitted in source). */
  approvals?: ActorFlowApprovalPolicy
  /** True when the flow declares a deterministic `verify` hook. */
  hasVerify?: boolean
  /** Display title. */
  title?: string
  /** Display description. */
  description?: string
  /** Organizational tags. */
  tags?: string[]
}

/** Actor flows metadata for inspector/CLI, keyed by actor flow name. */
export type ActorFlowMeta = Record<string, ActorFlowMetaEntry>
