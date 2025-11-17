/**
 * Type constraint: MCP prompt functions must return properly formatted messages
 *
 * MCP prompts must return an array of message objects with role and content.
 */

import {
  wireMCPPrompt,
  pikkuMCPPromptFunc,
} from '../../.pikku/pikku-types.gen.js'

// Valid: Prompt with proper return type
wireMCPPrompt({
  name: 'simplePrompt',
  description: 'A simple prompt',
  func: pikkuMCPPromptFunc<unknown>(async () => {
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'This is a prompt message',
        },
      },
    ]
  }),
})

// Valid: Prompt with input parameters
wireMCPPrompt({
  name: 'dynamicPrompt',
  description: 'A dynamic prompt',
  func: pikkuMCPPromptFunc<{ topic: string; level: string }>(
    async ({}, { topic, level }, {}) => {
      return [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Explain ${topic} at ${level} level`,
          },
        },
      ]
    }
  ),
})

wireMCPPrompt({
  name: 'invalidNotArray',
  description: 'Invalid return - not an array',
  // @ts-expect-error - Return type must be array
  func: pikkuMCPPromptFunc<unknown>(async () => {
    return {
      role: 'user',
      content: { type: 'text', text: 'message' },
    }
  }),
})

wireMCPPrompt({
  name: 'invalidNoRole',
  description: 'Invalid return - no role',
  // @ts-expect-error - Message must have role property
  func: pikkuMCPPromptFunc<unknown>(async () => {
    return [
      {
        content: {
          type: 'text',
          text: 'message',
        },
      },
    ]
  }),
})

wireMCPPrompt({
  name: 'invalidNoContent',
  description: 'Invalid return - no content',
  // @ts-expect-error - Message must have content property
  func: pikkuMCPPromptFunc<unknown>(async () => {
    return [
      {
        role: 'user',
      },
    ]
  }),
})

wireMCPPrompt({
  name: 'invalidContentStructure',
  description: 'Invalid content structure',
  // @ts-expect-error - Content must have type and text properties
  func: pikkuMCPPromptFunc<unknown>(async () => {
    return [
      {
        role: 'user',
        content: {
          message: 'invalid',
        },
      },
    ]
  }),
})

// Valid: Multiple messages
wireMCPPrompt({
  name: 'multiMessage',
  description: 'Multiple messages',
  func: pikkuMCPPromptFunc<unknown>(async () => {
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'First message',
        },
      },
      {
        role: 'user',
        content: {
          type: 'text',
          text: 'Second message',
        },
      },
    ]
  }),
})

// Valid: Prompt with complex input and conditional logic
wireMCPPrompt({
  name: 'complexPrompt',
  description: 'Complex prompt with options',
  func: pikkuMCPPromptFunc<{
    topic: string
    complexity: 'beginner' | 'intermediate' | 'advanced'
    includeExamples?: boolean
  }>(async ({}, { topic, complexity, includeExamples }, {}) => {
    let text = `Learn ${topic} - ${complexity} level`
    if (includeExamples) {
      text += '\nWith examples included'
    }
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text,
        },
      },
    ]
  }),
})

wireMCPPrompt({
  name: 'invalidInputAccess',
  description: 'Invalid input property access',
  func: pikkuMCPPromptFunc<{ topic: string }>(async ({}, data, {}) => {
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          // @ts-expect-error - Accessing property that doesn't exist in input type
          text: `Topic: ${data.subject}`,
        },
      },
    ]
  }),
})
