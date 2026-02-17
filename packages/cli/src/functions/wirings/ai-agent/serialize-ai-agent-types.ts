export const serializeAIAgentTypes = (functionTypesImportPath: string) => {
  return `import {
  CoreAIAgent,
  PikkuAIMiddlewareHooks,
} from '@pikku/core/ai-agent'
import type { PikkuPermission, PikkuMiddleware, Services } from '${functionTypesImportPath}'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { AIAgentMemoryConfig } from '@pikku/core/ai-agent'

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
`
}
