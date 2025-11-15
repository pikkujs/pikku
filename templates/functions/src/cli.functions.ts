import { pikkuFunc, pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

/**
 * @summary Greet user by name
 * @description Generates a personalized greeting message with optional uppercase formatting and timestamp
 */
export const greetUser = pikkuSessionlessFunc<
  { name: string; loud: boolean },
  { message: string; timestamp: string }
>({
  func: async (services, data) => {
    const message = `Hello, ${data.name}!`
    return {
      message: data.loud ? message.toUpperCase() : message,
      timestamp: new Date().toISOString(),
    }
  },
})

/**
 * @summary Add two numbers
 * @description Performs addition operation on two numbers and returns the result with a formatted expression
 */
export const addNumbers = pikkuFunc<
  { a: number; b: number },
  { operation: string; operands: number[]; result: number; expression: string }
>({
  func: async (services, data) => {
    const result = data.a + data.b
    return {
      operation: 'add',
      operands: [data.a, data.b],
      result,
      expression: `${data.a} + ${data.b} = ${result}`,
    }
  },
})

/**
 * @summary Subtract two numbers
 * @description Performs subtraction operation on two numbers and returns the result with a formatted expression
 */
export const subtractNumbers = pikkuFunc<
  { a: number; b: number },
  { operation: string; operands: number[]; result: number; expression: string }
>({
  func: async (services, data) => {
    const result = data.a - data.b
    return {
      operation: 'subtract',
      operands: [data.a, data.b],
      result,
      expression: `${data.a} - ${data.b} = ${result}`,
    }
  },
})

/**
 * @summary Multiply two numbers
 * @description Performs multiplication operation on two numbers and returns the result with a formatted expression
 */
export const multiplyNumbers = pikkuFunc<
  { a: number; b: number },
  { operation: string; operands: number[]; result: number; expression: string }
>({
  func: async (services, data) => {
    const result = data.a * data.b
    return {
      operation: 'multiply',
      operands: [data.a, data.b],
      result,
      expression: `${data.a} * ${data.b} = ${result}`,
    }
  },
})

/**
 * @summary Divide two numbers
 * @description Performs division operation on two numbers with zero-division protection and returns the result with a formatted expression
 */
export const divideNumbers = pikkuFunc<
  { a: number; b: number },
  { operation: string; operands: number[]; result: number; expression: string }
>({
  func: async (services, data) => {
    if (data.b === 0) {
      throw new Error('Division by zero is not allowed')
    }
    const result = data.a / data.b
    return {
      operation: 'divide',
      operands: [data.a, data.b],
      result,
      expression: `${data.a} / ${data.b} = ${result}`,
    }
  },
})

/**
 * @summary Create new user account
 * @description Creates a new user with username, email, and optional admin privileges, returning user details with generated ID
 */
export const createUser = pikkuFunc<
  { username: string; email: string; admin?: boolean },
  {
    id: number
    username: string
    email: string
    admin: boolean
    created: string
  }
>({
  func: async (services, data) => {
    services.logger.info(`Creating user: ${data.username}`)

    return {
      id: Math.floor(Math.random() * 10000),
      username: data.username,
      email: data.email,
      admin: data.admin || false,
      created: new Date().toISOString(),
    }
  },
})

/**
 * @summary List all users with filtering
 * @description Retrieves user list with optional filtering by admin status and limit on results count
 */
export const listUsers = pikkuFunc<
  { limit?: number; admin?: boolean },
  { users: any[]; total: number; filtered: boolean }
>({
  func: async (services, data) => {
    const allUsers = [
      { id: 1, username: 'alice', email: 'alice@example.com', admin: true },
      { id: 2, username: 'bob', email: 'bob@example.com', admin: false },
      {
        id: 3,
        username: 'charlie',
        email: 'charlie@example.com',
        admin: false,
      },
      { id: 4, username: 'diana', email: 'diana@example.com', admin: true },
    ]

    let users = allUsers

    if (data.admin !== undefined) {
      users = users.filter((user) => user.admin === data.admin)
    }

    if (data.limit) {
      users = users.slice(0, data.limit)
    }

    return {
      users,
      total: users.length,
      filtered: data.admin !== undefined || data.limit !== undefined,
    }
  },
})

/**
 * @summary Process file with specified action
 * @description Performs read, info, or delete operations on a file with optional backup creation
 */
export const processFile = pikkuFunc<
  { path: string; action: 'read' | 'info' | 'delete'; backup?: boolean },
  {
    path: string
    action: string
    backup: boolean
    processed: boolean
    timestamp: string
    size: number
  }
>({
  func: async (services, data) => {
    services.logger.info(
      `Processing file: ${data.path} with action: ${data.action}`
    )

    return {
      path: data.path,
      action: data.action,
      backup: data.backup || false,
      processed: true,
      timestamp: new Date().toISOString(),
      size: Math.floor(Math.random() * 100000),
    }
  },
})
