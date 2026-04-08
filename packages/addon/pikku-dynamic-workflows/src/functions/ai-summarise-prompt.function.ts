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
      `Summarise this workflow request into 1-2 concise, human-readable sentences that describe the workflow's purpose and what it achieves. Focus on the business intent, not technical details like input types, node counts, or implementation specifics.

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
