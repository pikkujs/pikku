import { z } from 'zod'
import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'

/**
 * Structured output is only enabled when the agent exposes no tools — with a
 * tool present the runner silently falls back to free text. This agent is
 * deliberately tool-free so the `output` schema drives an object response.
 */
export const StructuredAgentOutput = z.object({
  sentiment: z.string(),
  score: z.number(),
  summary: z.string(),
})

export const structuredAgent = pikkuAIAgent({
  name: 'structured-agent',
  description: 'Classifies a message and returns a structured verdict',
  goal: 'You classify the sentiment of the user message and return a structured result.',
  model: 'openai/gpt-5-mini',
  output: StructuredAgentOutput,
  maxSteps: 3,
  toolChoice: 'auto',
})
