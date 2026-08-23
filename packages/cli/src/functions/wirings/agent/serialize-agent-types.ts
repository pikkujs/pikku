export const serializeAgentTypes = (
  functionTypesImportPath: string,
  middlewareTypesImportPath: string,
  authTypesImportPath: string,
  agentMapImportPath: string,
  scopesImportPath: string,
  scorerNamesImportPath: string
) => {
  return `import { CoreAgent } from '@pikku/core/agent'
import {
  agent as coreAgent,
  agentStream as coreAgentStream,
  agentResume as coreAgentResume,
  agentApprove as coreAgentApprove,
} from '@pikku/core/agent'
import {
  pikkuAgentScorer as corePikkuAgentScorer,
  pikkuAgentJudge as corePikkuAgentJudge,
} from '@pikku/core/agent-scorer'
import type { Services, PikkuFunctionConfig } from '${functionTypesImportPath}'
import type { PikkuPermission } from '${authTypesImportPath}'
import type { PikkuMiddleware } from '${middlewareTypesImportPath}'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { AgentMemoryConfig, AgentInput } from '@pikku/core/agent'
import type { AgentMap } from '${agentMapImportPath}'
import type { ScopeId } from '${scopesImportPath}'
import type { ScorerName } from '${scorerNamesImportPath}'

type AgentConfig<
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
> = Omit<CoreAgent<PikkuPermission, PikkuMiddleware, ScopeId, ScorerName>, 'tools' | 'agents' | 'workflows' | 'memory' | 'input' | 'output'> & {
  input?: InputSchema
  output?: OutputSchema
  memory?: Omit<AgentMemoryConfig, 'workingMemory'> & { workingMemory?: StandardSchemaV1 }
  tools?: object[]
  agents?: AgentConfig<StandardSchemaV1 | undefined, StandardSchemaV1 | undefined>[]
  workflows?: object[]
}

/**
 * Declares an agent: the model, the prompt, the tools it may call and the shape
 * of what it returns. Wire it like any other function.
 *
 * @example snippet: aiAgent
 */
export const pikkuAgent = <
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
>(
  agent: AgentConfig<InputSchema, OutputSchema>
) => {
  return agent
}

/**
 * Declares a scorer that grades an agent run programmatically — a function over
 * the run's input and output returning a score.
 */
export const pikkuAgentScorer = (
  config: Parameters<typeof corePikkuAgentScorer<Services>>[0]
) => corePikkuAgentScorer<Services>(config)

/**
 * Declares a scorer that grades an agent run with another model, for the
 * qualities a programmatic check cannot express.
 */
export const pikkuAgentJudge = (
  config: Parameters<typeof corePikkuAgentJudge<Services>>[0]
) => corePikkuAgentJudge<Services>(config)



/**
 * A ready-made function that runs the named agent once and returns its result —
 * wire it straight to a route when you need no logic around the run.
 *
 * @example snippet: aiAgentInvoke
 */
export const agent = <Name extends keyof AgentMap>(
  agentName: Name
) => {
  return coreAgent<AgentMap>(agentName as string & keyof AgentMap) as PikkuFunctionConfig<
    AgentInput,
    { runId: string; result: AgentMap[Name]['output']; usage: { inputTokens: number; outputTokens: number } },
    'session' | 'rpc'
  >
}

/**
 * The streaming counterpart of \`agent\`: wire it to a channel to send tokens and
 * tool calls as they happen instead of waiting for the run to finish.
 *
 * @example snippet: aiAgentStream
 */
export const agentStream = <Name extends keyof AgentMap>(
  agentName?: Name
) => {
  return coreAgentStream<AgentMap>(agentName as string & keyof AgentMap) as PikkuFunctionConfig<
    { agentName?: string; message: string; threadId: string; resourceId: string },
    void,
    'session' | 'rpc'
  >
}

/**
 * A ready-made function that answers one pending tool approval, letting a run
 * that paused for a human carry on.
 */
export const agentResume = () => {
  return coreAgentResume() as PikkuFunctionConfig<
    { runId: string; toolCallId: string; approved: boolean },
    void,
    'session' | 'rpc'
  >
}

/**
 * A ready-made function that answers every pending approval for a run at once.
 */
export const agentApprove = <Name extends keyof AgentMap>(
  agentName: Name
) => {
  return coreAgentApprove<AgentMap>(agentName as string & keyof AgentMap) as PikkuFunctionConfig<
    { runId: string; approvals: { toolCallId: string; approved: boolean }[] },
    unknown,
    'session' | 'rpc'
  >
}
`
}
