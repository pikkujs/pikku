import { NotFoundError } from '@pikku/core'
import {
  pikkuMCPPromptFunc,
  pikkuMCPResourceFunc,
  pikkuMCPToolFunc,
} from '../.pikku/pikku-types.gen.js'

/**
 * Hello World MCP tool
 *
 * @summary Simple MCP tool that greets the user by name
 * @description This MCP tool demonstrates basic tool functionality in the Model Context Protocol.
 * It accepts an optional name parameter and returns a personalized greeting. If no name is provided,
 * it defaults to 'World'. This shows how to create simple, stateless MCP tools in Pikku.
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
 * Dynamic tool disabling
 *
 * @summary MCP tool that can disable other tools at runtime
 * @description This demonstrates dynamic MCP tool management in Pikku. It allows disabling
 * other tools by name during runtime, which can be useful for access control or feature toggling.
 * Returns a confirmation message indicating whether the tool was successfully disabled.
 */
export const disableTool = pikkuMCPToolFunc<{ name: string }>(
  async ({ mcp }, { name }) => {
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
 * Calculator MCP tool
 *
 * @summary Performs basic arithmetic operations (add, subtract, multiply, divide)
 * @description This MCP tool demonstrates parameter validation and error handling. It accepts
 * an operation type and two numbers, performs the calculation, and returns a formatted result.
 * Includes division-by-zero protection and handles unknown operations gracefully.
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
 * Static MCP resource
 *
 * @summary Returns a predefined static resource
 * @description This MCP resource demonstrates how to expose static data through the Model Context
 * Protocol. Resources are different from tools - they provide data rather than performing actions.
 * This example returns a simple JSON string at the resource URI.
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
 * User information MCP resource
 *
 * @summary Retrieves mock user data by user ID
 * @description This MCP resource demonstrates dynamic resource fetching with parameters.
 * It accepts a userId and returns corresponding user information from a mock database.
 * Shows error handling for resource not found scenarios using Pikku's NotFoundError.
 */
export const getUserInfo = pikkuMCPResourceFunc<{ userId: string }>(
  async ({ mcp, logger }, { userId }) => {
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
 * Static prompt generator
 *
 * @summary MCP prompt that returns a predefined message
 * @description This demonstrates creating static MCP prompts that don't require parameters.
 * Prompts in MCP are pre-formatted messages that can be used to guide AI interactions.
 * This example shows the simplest form of a prompt function.
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
 * Dynamic prompt generator
 *
 * @summary Creates customized prompts based on topic, complexity, and example preferences
 * @description This MCP prompt demonstrates parameterized prompt generation. It creates
 * educational content tailored to the specified topic and complexity level (beginner, intermediate,
 * or advanced). Optionally includes practical examples. Shows how to build flexible, reusable
 * prompt templates in Pikku.
 */
export const dynamicPromptGenerator = pikkuMCPPromptFunc<{
  topic: string
  complexity: 'beginner' | 'intermediate' | 'advanced'
  includeExamples?: string
}>(async ({ logger }, { topic, complexity, includeExamples = false }) => {
  logger.info(
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
