/** Harness shim — stands in for `.pikku/agent/pikku-agent-types.gen.ts`. */

export type AIAgentConfig = {
  name: string
  description?: string
  goal: string
  model?: string
  temperature?: number
  memory?: unknown
  output?: unknown
  tools?: unknown[]
  agents?: unknown[]
  workflows?: unknown[]
  maxSteps?: number
}

export const pikkuAIAgent = (config: AIAgentConfig): AIAgentConfig => config
