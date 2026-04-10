import { pikkuSessionlessFunc } from '#pikku'
import { callClaude, extractJson } from '../utils/claude.js'

export const aiDesignAgent = pikkuSessionlessFunc<
  {
    prompt: string
    schemas: string
    availableMiddleware: {
      name: string
      description: string
      requiresService: string
    }[]
    previousError?: string
  },
  {
    config: {
      instructions: string
      description: string
      model: string
      tools: string[]
      maxSteps: number
      temperature?: number
      toolChoice: 'auto' | 'required' | 'none'
      aiMiddleware?: string[]
      tags?: string[]
    }
    inputTokens: number
    outputTokens: number
    costUsd: number
  }
>({
  description:
    'Uses AI to design an agent configuration from a prompt and tool schemas',
  func: async ({}, { prompt, schemas, availableMiddleware, previousError }) => {
    const middlewareList = availableMiddleware
      .map(
        (m) =>
          `- ${m.name}: ${m.description} (requires "${m.requiresService}" service)`
      )
      .join('\n')

    let claudePrompt = `You are designing an AI agent configuration.

User request: "${prompt}"

## Available Tools and Their Schemas

${schemas}

## Available AI Middleware

${middlewareList}

## Instructions

Design an agent configuration as a JSON object with these fields:

- "instructions" (string): Detailed instructions for the agent. Explain each tool's purpose, its parameters, and when/how to use it. Be specific and thorough. This is the agent's system prompt.
- "description" (string): A short one-line description of what the agent does.
- "model" (string): The AI model to use in "provider/name" format (e.g. "openai/gpt-4o", "openai/o4-mini", "anthropic/claude-sonnet-4-20250514"). Default to "openai/o4-mini" unless the task requires advanced reasoning.
- "tools" (string[]): Array of tool names the agent should have access to. Use the exact names from the schemas above.
- "maxSteps" (number): Maximum number of tool-calling steps. Use 5-10 for simple tasks, 10-20 for complex multi-step tasks.
- "temperature" (number, optional): Between 0 and 2. Only include if the task benefits from creativity (higher) or precision (lower).
- "toolChoice" (string): One of "auto", "required", or "none". Use "auto" in most cases.
- "aiMiddleware" (string[], optional): Include middleware names only if the user's request explicitly mentions voice, audio, speech, or transcription.
- "tags" (string[], optional): Descriptive tags for categorization.

Return ONLY the JSON object, no explanation.`

    if (previousError) {
      claudePrompt += `\n\n## Previous Attempt Failed With These Errors\n\n${previousError}\n\nFix these errors in your new configuration.`
    }

    const result = callClaude(claudePrompt)
    const config = extractJson(result.text) as any

    if (!config) {
      return {
        config: {
          instructions: '',
          description: '',
          model: 'openai/o4-mini',
          tools: [],
          maxSteps: 10,
          toolChoice: 'auto' as const,
        },
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
      }
    }

    return {
      config: {
        instructions: config.instructions || '',
        description: config.description || '',
        model: config.model || 'openai/o4-mini',
        tools: Array.isArray(config.tools) ? config.tools : [],
        maxSteps: typeof config.maxSteps === 'number' ? config.maxSteps : 10,
        temperature:
          typeof config.temperature === 'number'
            ? config.temperature
            : undefined,
        toolChoice: ['auto', 'required', 'none'].includes(config.toolChoice)
          ? config.toolChoice
          : 'auto',
        aiMiddleware:
          Array.isArray(config.aiMiddleware) && config.aiMiddleware.length > 0
            ? config.aiMiddleware
            : undefined,
        tags:
          Array.isArray(config.tags) && config.tags.length > 0
            ? config.tags
            : undefined,
      },
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    }
  },
})
