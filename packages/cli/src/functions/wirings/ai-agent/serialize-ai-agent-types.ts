export const serializeAIAgentTypes = (functionTypesImportPath: string) => {
  return `import {
  CoreAIAgent,
  wireAIAgent as wireAIAgentCore,
  AIAgentInput,
  AIAgentOutput,
} from '@pikku/core/ai-agent'

import type { PikkuFunctionConfig } from '${functionTypesImportPath}'

type AIAgentWiring = CoreAIAgent<PikkuFunctionConfig<AIAgentInput, AIAgentOutput, 'rpc' | 'session'>>

export const wireAIAgent = (
  agent: AIAgentWiring
) => {
  wireAIAgentCore(agent as any)
}
`
}
