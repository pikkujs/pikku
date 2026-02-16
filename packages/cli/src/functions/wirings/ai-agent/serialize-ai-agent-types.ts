export const serializeAIAgentTypes = (functionTypesImportPath: string) => {
  return `import {
  CoreAIAgent,
  PikkuAIMiddlewareHooks,
} from '@pikku/core/ai-agent'
import type { PikkuPermission, PikkuMiddleware } from '${functionTypesImportPath}'
import type { StandardSchemaV1 } from '@standard-schema/spec'

type AIAgentConfig = CoreAIAgent<PikkuPermission, PikkuMiddleware> & {
  input?: StandardSchemaV1
  output?: StandardSchemaV1
}

export const pikkuAIAgent = (
  agent: AIAgentConfig
) => {
  return agent
}

export const pikkuAIMiddleware = <
  SingletonServices = any,
  Event = unknown,
>(
  hooks: PikkuAIMiddlewareHooks<SingletonServices, Event>
): PikkuAIMiddlewareHooks<SingletonServices, Event> => hooks
`
}
