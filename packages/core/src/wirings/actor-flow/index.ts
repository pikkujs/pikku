/**
 * Actor flow module exports.
 *
 * An actor holds a dynamic conversation with a target Pikku AI agent via
 * `actor.converse(...)` — playing its own persona, approving the agent's tool
 * requests in-persona, and evaluating whether the task was accomplished. The
 * conversation engine here is transport-agnostic; the actor drives the target
 * over HTTP.
 */
export type {
  ActorFlowApprovalPolicy,
  ActorFlowVerdict,
  ConverseOptions,
  TargetAgentReply,
  TargetPendingApproval,
  TargetAgentDriver,
} from './actor-flow.types.js'
export {
  runConversation,
  type RunConversationParams,
  type PersonaLLM,
} from './run-conversation.js'
