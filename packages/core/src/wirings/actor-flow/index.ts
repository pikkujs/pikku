/**
 * Actor flow module exports.
 *
 * An actor flow is an LLM-driven actor that plays a configured persona and
 * holds a real conversation with a target Pikku AI agent — approving the
 * agent's tool requests in-persona and evaluating whether the task was met.
 */
export type {
  CoreActorFlow,
  ActorFlowApprovalPolicy,
  ActorFlowVerifyContext,
  ActorFlowVerdict,
  ActorFlowMeta,
  ActorFlowMetaEntry,
} from './actor-flow.types.js'
export { runActorFlow, type RunActorFlowParams } from './run-actor-flow.js'
