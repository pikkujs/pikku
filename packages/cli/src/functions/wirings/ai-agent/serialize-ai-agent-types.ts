export const serializeAIAgentTypes = (_functionTypesImportPath: string) => {
  return `import {
  CoreAIAgent,
} from '@pikku/core/ai-agent'
import type { StandardSchemaV1 } from '@standard-schema/spec'

type AIAgentConfig = CoreAIAgent & {
  input?: StandardSchemaV1
  output?: StandardSchemaV1
}

export const pikkuAIAgent = (
  agent: AIAgentConfig
) => {
  return agent
}
`
}
