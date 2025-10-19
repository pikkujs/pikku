import { pikkuMCPPromptFunc } from '#pikku/pikku-types.gen.js'
import type { MCPPromptResponse } from '../pikku-types.gen.js'

/**
 * MCP Prompt function
 * Prompts are reusable prompt templates for AI models
 * CRITICAL: Always specify MCPPromptResponse as output type
 */

type ReviewPromptInput = {
  language: string
  focusArea?: string
}

export const reviewPrompt = pikkuMCPPromptFunc<
  ReviewPromptInput,
  MCPPromptResponse
>({
  docs: {
    summary: 'Generate code review prompt',
    description: 'Create a prompt template for code review',
    tags: ['mcp', 'prompts'],
    errors: [],
  },
  // ✅ CORRECT: May not need services for simple prompts
  func: async (_services, input) => {
    const focusText = input.focusArea ? ` with focus on ${input.focusArea}` : ''

    // ✅ CORRECT: Return MCPPromptResponse format
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Please review this ${input.language} code following Pikku rules${focusText}.`,
        },
      },
    ]
  },
})
