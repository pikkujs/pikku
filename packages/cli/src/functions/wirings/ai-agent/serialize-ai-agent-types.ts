export const serializeAIAgentTypes = (functionTypesImportPath: string) => {
  return `import {
  CoreAIAgent,
  PikkuAIMiddlewareHooks,
} from '@pikku/core/ai-agent'
import type { PikkuPermission, PikkuMiddleware, Services } from '${functionTypesImportPath}'
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
  RequiredServices extends Services = Services,
  Event = unknown,
>(
  hooks: PikkuAIMiddlewareHooks<RequiredServices, Event>
): PikkuAIMiddlewareHooks<RequiredServices, Event> => hooks
`
}
