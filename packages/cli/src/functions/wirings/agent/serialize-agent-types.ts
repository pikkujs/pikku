export const serializeAgentTypes = (
  functionTypesImportPath: string,
  agentMapImportPath: string,
  scopesImportPath: string,
  scorerNamesImportPath: string
) => {
  return `import { CoreAgent, PikkuAgentMiddlewareHooks } from '@pikku/core/agent'
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
import type { PikkuPermission, PikkuMiddleware, Services, PikkuFunctionConfig } from '${functionTypesImportPath}'
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

export const pikkuAgent = <
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined
>(
  agent: AgentConfig<InputSchema, OutputSchema>
) => {
  return agent
}

export const pikkuAgentScorer = (
  config: Parameters<typeof corePikkuAgentScorer<Services>>[0]
) => corePikkuAgentScorer<Services>(config)

export const pikkuAgentJudge = (
  config: Parameters<typeof corePikkuAgentJudge<Services>>[0]
) => corePikkuAgentJudge<Services>(config)

export const pikkuAgentMiddleware = <
  State extends Record<string, unknown> = Record<string, unknown>,
  RequiredServices extends Services = Services,
>(
  hooks: PikkuAgentMiddlewareHooks<State, RequiredServices>
): PikkuAgentMiddlewareHooks<State, RequiredServices> => hooks

export const agent = <Name extends keyof AgentMap>(
  agentName: Name
) => {
  return coreAgent<AgentMap>(agentName as string & keyof AgentMap) as PikkuFunctionConfig<
    AgentInput,
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
