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

//TODO: SWitch RequiredServices to be the second generic and default it to Services, and Event to be the first generic and default it to unknown, to match the order of generics in PikkuMiddlewareHooks. 
// should also pass in state as a type here
export const pikkuAIMiddleware = <
  RequiredServices extends Services = Services,
  Event = unknown,
>(
  hooks: PikkuAIMiddlewareHooks<RequiredServices, Event>
): PikkuAIMiddlewareHooks<RequiredServices, Event> => hooks
`
}
