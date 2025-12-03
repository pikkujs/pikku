import { NotFoundError } from '@pikku/core'
import {
  pikkuMCPPromptFunc,
  pikkuMCPResourceFunc,
  pikkuMCPToolFunc,
} from '../.pikku/pikku-types.gen.js'

/**
 * A simple hello world MCP tool that greets the user
 */
export const sayHello = pikkuMCPToolFunc<{ name?: string }>(
  async (services, { name = 'World' }, {}) => {
    services.logger.info(`Saying hello to: ${name}`)

    return [
      {
        type: 'text',
        text: `Hello, ${name}! This is a Pikku MCP tool.`,
      },
    ]
  }
)

export const disableTool = pikkuMCPToolFunc<{ name: string }>(
  async (services, { name }, { mcp }) => {
    const changed = await mcp.enableTools({ [name]: false })
    if (changed) {
      return [
        {
          type: 'text',
          text: `Tool '${name}' has been disabled.`,
        },
      ]
    } else {
      return [
        {
          type: 'text',
          text: `Tool '${name}' is not enabled or does not exist.`,
        },
      ]
    }
  }
)

/**
 * A simple calculator MCP tool that performs basic math operations
 */
export const calculate = pikkuMCPToolFunc<{
  operation: 'add' | 'subtract' | 'multiply' | 'divide'
  a: number
  b: number
}>(async ({ logger }, { operation, a, b }, wire) => {
  logger.info(`Calculating: ${a} ${operation} ${b}`)

  let result: number

  switch (operation) {
    case 'add':
      result = a + b
      break
    case 'subtract':
      result = a - b
      break
    case 'multiply':
      result = a * b
      break
    case 'divide':
      if (b === 0) {
        throw new Error('Division by zero is not allowed')
      }
      result = a / b
      break
    default:
      throw new Error(`Unknown operation: ${operation}`)
  }

  return [
    {
      type: 'text',
      text: `The result of ${a} ${operation} ${b} is ${result}.`,
    },
  ]
})

/**
 * A static resource that returns predefined data
 */
export const getStaticResource = pikkuMCPResourceFunc<unknown>(
  async ({}, _data, { mcp }) => {
    return [
      {
        uri: mcp.uri!,
        text: JSON.stringify('Hello! This is a static resource.'),
      },
    ]
  }
)

/**
 * A mock user information resource that returns user data
 */
export const getUserInfo = pikkuMCPResourceFunc<{ userId: string }>(
  async ({ logger }, { userId }, { mcp }) => {
    logger.info(`Getting user info for: ${userId}`)

    // Mock user data - in a real app this would come from a database
    const mockUsers: Record<
      string,
      { userId: string; name: string; email: string; lastLogin: string }
    > = {
      '123': {
        userId: '123',
        name: 'John Doe',
        email: 'john@example.com',
        lastLogin: '2024-01-15T10:30:00Z',
      },
      '456': {
        userId: '456',
        name: 'Jane Smith',
        email: 'jane@example.com',
        lastLogin: '2024-01-14T15:45:00Z',
      },
    }

    const user = mockUsers[userId]
    if (!user) {
      throw new NotFoundError(`User not found: ${userId}`)
    }

    return [
      {
        uri: mcp.uri!,
        text: JSON.stringify(user),
      },
    ]
  }
)

/**
 * A progress enhancement example prompt that shows how to create dynamic prompts with arguments
 */
export const staticPromptGenerator = pikkuMCPPromptFunc<unknown>(
  async (services, data, wire) => {
    return [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `This is a static prompt example. It does not take any arguments and simply returns a predefined message.`,
        },
      },
    ]
  }
)

/**
 * A progress enhancement example prompt that shows how to create dynamic prompts with arguments
 */
export const dynamicPromptGenerator = pikkuMCPPromptFunc<{
  topic: string
  complexity: 'beginner' | 'intermediate' | 'advanced'
  includeExamples?: string
}>(async (services, { topic, complexity, includeExamples = false }, wire) => {
  services.logger.info(
    `Generating progressive enhancement content for: ${topic} (${complexity})`
  )

  let content = `# Progressive Enhancement for ${topic}\n\n`

  switch (complexity) {
    case 'beginner':
      content += `This is a beginner-friendly introduction to ${topic}.\n\n`
      content += `Start with the basics and build up your understanding gradually.\n`
      break
    case 'intermediate':
      content += `This is an intermediate guide to ${topic}.\n\n`
      content += `Assumes some familiarity with related concepts.\n`
      break
    case 'advanced':
      content += `This is an advanced discussion of ${topic}.\n\n`
      content += `Deep dive into complex scenarios and edge cases.\n`
      break
  }

  if (includeExamples) {
    content += `\n## Examples\n\n`
    content += `Here are some practical examples for ${topic}:\n`
    content += `- Example 1: Basic implementation\n`
    content += `- Example 2: Advanced use case\n`
    content += `- Example 3: Common pitfalls to avoid\n`
  }

  return [
    {
      role: 'user' as const,
      content: {
        type: 'text' as const,
        text: content,
      },
    },
  ]
})
