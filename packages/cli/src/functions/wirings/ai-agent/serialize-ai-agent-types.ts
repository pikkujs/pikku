export const serializeAIAgentTypes = (
  functionTypesImportPath: string,
  agentMapImportPath: string
) => {
  return `import {
  CoreAIAgent,
  PikkuAIMiddlewareHooks,
} from '@pikku/core/ai-agent'
import {
  agent as coreAgent,
  agentStream as coreAgentStream,
  agentResume as coreAgentResume,
  agentApprove as coreAgentApprove,
} from '@pikku/core/ai-agent'
import type { PikkuPermission, PikkuMiddleware, Services, PikkuFunctionConfig } from '${functionTypesImportPath}'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { AIAgentMemoryConfig, AIAgentInput } from '@pikku/core/ai-agent'
import type { AgentMap } from '${agentMapImportPath}'

type AIAgentConfig = Omit<CoreAIAgent<PikkuPermission, PikkuMiddleware>, 'tools' | 'agents' | 'memory'> & {
  input?: StandardSchemaV1
  output?: StandardSchemaV1
  memory?: Omit<AIAgentMemoryConfig, 'workingMemory'> & { workingMemory?: StandardSchemaV1 }
  tools?: object[]
  agents?: AIAgentConfig[]
}

export const pikkuAIAgent = (
  agent: AIAgentConfig
) => {
  return agent
}

export const pikkuAIMiddleware = <
  State extends Record<string, unknown> = Record<string, unknown>,
  RequiredServices extends Services = Services,
>(
  hooks: PikkuAIMiddlewareHooks<State, RequiredServices>
): PikkuAIMiddlewareHooks<State, RequiredServices> => hooks

export const agent = <Name extends keyof AgentMap>(
  agentName: Name
) => {
  return coreAgent<AgentMap>(agentName as string & keyof AgentMap) as PikkuFunctionConfig<
    AIAgentInput,
    { runId: string; result: AgentMap[Name]['output']; usage: { inputTokens: number; outputTokens: number } },
    'session' | 'rpc'
  >
}

export const agentStream = <Name extends keyof AgentMap>(
  agentName?: Name
) => {
  return coreAgentStream<AgentMap>(agentName as string & keyof AgentMap) as PikkuFunctionConfig<
    { agentName?: string; message: string; threadId: string; resourceId: string },
    void,
    'session' | 'rpc'
  >
}

export const agentResume = () => {
  return coreAgentResume() as PikkuFunctionConfig<
    { runId: string; toolCallId: string; approved: boolean },
    void,
    'session' | 'rpc'
  >
}

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
