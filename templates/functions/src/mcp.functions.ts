import { NotFoundError } from '@pikku/core'
import {
  pikkuMCPPromptFunc,
  pikkuMCPResourceFunc,
  pikkuMCPToolFunc,
} from '../.pikku/pikku-types.gen.js'

/**
 * @summary Greet user via MCP
 * @description Simple hello world MCP tool that returns a personalized greeting message
 */
export const sayHello = pikkuMCPToolFunc<{ name?: string }>(
  async (services, { name = 'World' }) => {
    services.logger.info(`Saying hello to: ${name}`)

    return [
      {
        type: 'text',
        text: `Hello, ${name}! This is a Pikku MCP tool.`,
      },
    ]
  }
)

/**
 * @summary Disable MCP tool by name
 * @description Dynamically disables a specific MCP tool at runtime and reports the result
 */
export const disableTool = pikkuMCPToolFunc<{ name: string }>(
  async (services, { name }) => {
    const changed = await services.mcp.enableTools({ [name]: false })
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
 * @summary Perform mathematical calculation
 * @description MCP calculator tool supporting addition, subtraction, multiplication, and division with zero-division protection
 */
export const calculate = pikkuMCPToolFunc<{
  operation: 'add' | 'subtract' | 'multiply' | 'divide'
  a: number
  b: number
}>(async ({ logger }, { operation, a, b }) => {
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
 * @summary Get static resource data
 * @description MCP resource that returns predefined static content for demonstration purposes
 */
export const getStaticResource = pikkuMCPResourceFunc<unknown>(
  async ({ mcp }) => {
    return [
      {
        uri: mcp.uri!,
        text: JSON.stringify('Hello! This is a static resource.'),
      },
    ]
  }
)

/**
 * @summary Retrieve user information
 * @description MCP resource that fetches user data by ID from a mock database with error handling for missing users
 */
export const getUserInfo = pikkuMCPResourceFunc<{ userId: string }>(
  async ({ mcp, logger }, { userId }) => {
    logger.info(`Getting user info for: ${userId}`)

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
 * @summary Generate static prompt
 * @description MCP prompt that returns a predefined message without requiring any arguments
 */
export const staticPromptGenerator = pikkuMCPPromptFunc<unknown>(async () => {
  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `This is a static prompt example. It does not take any arguments and simply returns a predefined message.`,
      },
    },
  ]
})

/**
 * @summary Generate dynamic prompt by topic
 * @description MCP prompt generator that creates customized progressive enhancement content based on topic and complexity level with optional examples
 */
export const dynamicPromptGenerator = pikkuMCPPromptFunc<{
  topic: string
  complexity: 'beginner' | 'intermediate' | 'advanced'
  includeExamples?: string
}>(async (services, { topic, complexity, includeExamples = false }) => {
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
