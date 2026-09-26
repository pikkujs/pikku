/**
 * Registers `wire.rpc.agent`. Imported for the side effect alone so the RPC
 * primitive can offer the agent surface without naming the agent runtime, which
 * would pin it into every deployment unit.
 */
import './agent-rpc.js'

export {
  agent,
  agentStream,
  agentResume,
  agentApprove,
  agentInterrupt,
} from './agent-helpers.js'
export type { AgentRPCOptions, AgentRPCFactory } from './agent.types.js'
export { wrapChannelWithAGUI } from './agent-agui.js'
export { runAgent, resumeAgentSync } from './agent-runner.js'
export { resolveModelAlias } from './agent-model-config.js'
export { streamAgent, resumeAgent, interruptAgent } from './agent-stream.js'
export {
  voiceInput,
  NoSpeechDetectedError,
  SPOKEN_TURN,
  SPOKEN_TRANSCRIPT,
} from './voice-input.js'
export {
  voiceOutput,
  unspeakableScripts,
  voiceForText,
  type SpeakableScripts,
  type VoiceOutputState,
} from './voice-output.js'
export { AgentInterruptedError, signalRunInterrupt } from './agent-interrupt.js'
export type {
  AgentInterruption,
  AgentInterruptResult,
  InterruptibleRunHandle,
} from './agent-interrupt.js'
export {
  type RunAgentParams,
  type StreamAgentOptions,
  ToolApprovalRequired,
  ToolCredentialRequired,
  agentCallOptions,
  canAccessThread,
  isOwnedByPrincipal,
  threadOwnerConstraint,
} from './agent-prepare.js'
export { addAgent } from './agent-registry.js'
export type {
  AgentInput,
  AgentsMeta,
  AgentMemoryConfig,
  AgentStep,
  AgentContentPart,
  AgentRunRow,
  AgentRunService,
  AgentRunState,
  AgentMessage,
  AgentStreamChannel,
  AgentStreamEvent,
  AgentThread,
  CoreAgent,
  PendingApproval,
  PikkuAgentMiddlewareHooks,
} from './agent.types.js'
