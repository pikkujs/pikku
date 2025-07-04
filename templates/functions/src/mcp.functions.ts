import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

/**
 * A simple hello world MCP tool that greets the user
 */
export const sayHello = pikkuSessionlessFunc<
  { name?: string },
  { message: string; timestamp: number }
>(async (services, { name = 'World' }) => {
  services.logger.info(`Saying hello to: ${name}`)

  return {
    message: `Hello, ${name}! This is a Pikku MCP tool.`,
    timestamp: Date.now(),
  }
})

/**
 * A simple calculator MCP tool that performs basic math operations
 */
export const calculate = pikkuSessionlessFunc<
  {
    operation: 'add' | 'subtract' | 'multiply' | 'divide'
    a: number
    b: number
  },
  { result: number; operation: string }
>(async (services, { operation, a, b }) => {
  services.logger.info(`Calculating: ${a} ${operation} ${b}`)

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

  return {
    result,
    operation: `${a} ${operation} ${b} = ${result}`,
  }
})

/**
 * A mock user information resource that returns user data
 */
export const getUserInfo = pikkuSessionlessFunc<
  { userId: string },
  { userId: string; name: string; email: string; lastLogin: string }
>(async (services, { userId }) => {
  services.logger.info(`Getting user info for: ${userId}`)

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
    throw new Error(`User not found: ${userId}`)
  }

  return user
})
