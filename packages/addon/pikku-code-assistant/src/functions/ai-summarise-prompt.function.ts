import { pikkuSessionlessFunc } from '#pikku'
import { callClaude } from '../utils/claude.js'

export const aiSummarisePrompt = pikkuSessionlessFunc<
  { prompt: string },
  {
    summary: string
    inputTokens: number
    outputTokens: number
    costUsd: number
  }
>({
  expose: true,
  description:
    'Summarises a natural language prompt into a concise 1-2 sentence description',
  func: async ({}, { prompt }) => {
    const result = callClaude(
      `Summarise this agent request into 1-2 concise, human-readable sentences that describe the agent's purpose and capabilities. Focus on what the agent helps users do, not technical details like tool names or implementation specifics.

"${prompt}"

Return ONLY the summary. No quotes, no markdown, no preamble.`
    )

    return {
      summary: result.text.trim(),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    }
  },
})
