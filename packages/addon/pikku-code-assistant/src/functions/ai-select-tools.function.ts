import { pikkuSessionlessFunc } from '#pikku'
import { callClaude, extractJsonArray } from '../utils/claude.js'

export const aiSelectTools = pikkuSessionlessFunc<
  {
    prompt: string
    functions: { name: string; description: string }[]
  },
  {
    names: string[]
    inputTokens: number
    outputTokens: number
    costUsd: number
  }
>({
  description: 'Uses AI to select the most relevant tools for an agent prompt',
  func: async ({}, { prompt, functions }) => {
    const functionList = functions
      .map((f) => `- ${f.name}: ${f.description}`)
      .join('\n')

    const claudePrompt = `You are selecting tools for an AI agent to use.

User request: "${prompt}"

Available tools:
${functionList}

Return a JSON array of tool names (strings) that the agent should have access to in order to fulfill this request. Only include tools that the agent would actually need. Return ONLY the JSON array, no explanation.`

    const result = callClaude(claudePrompt)
    const names = extractJsonArray(result.text) ?? []

    return {
      names,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    }
  },
})
