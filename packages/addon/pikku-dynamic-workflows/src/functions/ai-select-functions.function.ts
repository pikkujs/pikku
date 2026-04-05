import { pikkuSessionlessFunc } from '#pikku'
import { callClaude, extractJsonArray } from '../utils/claude.js'

export const aiSelectFunctions = pikkuSessionlessFunc<
  {
    prompt: string
    functions: { name: string; description: string }[]
  },
  { names: string[]; inputTokens: number; outputTokens: number; costUsd: number }
>({
  description:
    'Uses AI to select the most relevant functions for a workflow prompt',
  func: async ({}, { prompt, functions }) => {
    const functionList = functions
      .map((f) => `- ${f.name}: ${f.description}`)
      .join('\n')

    const claudePrompt = `You are selecting functions to use in a workflow graph.

User request: "${prompt}"

Available functions:
${functionList}

Return a JSON array of function names (strings) that are relevant to fulfilling this request. Only include functions that would actually be used as steps in the workflow. Return ONLY the JSON array, no explanation.`

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
