import { wireMCPPrompt } from './pikku-types.gen.js'
import { reviewPrompt } from './functions/review-prompt.function.js'

/**
 * MCP Prompt wiring
 * Wire the reviewPrompt function defined in ./functions/review-prompt.function.ts
 */
wireMCPPrompt({
  name: 'reviewCode',
  description: 'Generate a code review prompt template',
  func: reviewPrompt,
  tags: ['code', 'review'],
})
