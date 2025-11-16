import { pikkuFunc, pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

/**
 * Greeting CLI command
 *
 * @summary Greets a user with optional uppercase formatting
 * @description This CLI function generates a personalized greeting message with a timestamp.
 * The 'loud' parameter controls whether the message is returned in uppercase. Demonstrates
 * basic CLI command structure in Pikku with parameter handling.
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
 * Add two numbers
 *
 * @summary CLI calculator function for addition
 * @description Performs addition of two numbers and returns a detailed result including
 * the operation type, operands, result, and a formatted expression string. Part of a
 * calculator CLI tool demonstrating arithmetic operations in Pikku.
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
 * Subtract two numbers
 *
 * @summary CLI calculator function for subtraction
 * @description Performs subtraction of two numbers and returns a detailed result including
 * the operation type, operands, result, and a formatted expression string.
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
 * Multiply two numbers
 *
 * @summary CLI calculator function for multiplication
 * @description Performs multiplication of two numbers and returns a detailed result including
 * the operation type, operands, result, and a formatted expression string.
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
 * Divide two numbers with zero-division protection
 *
 * @summary CLI calculator function for division
 * @description Performs division of two numbers with validation to prevent division by zero.
 * Returns a detailed result including the operation type, operands, result, and a formatted
 * expression string. Throws an error if the divisor is zero.
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
 * Create a new user
 *
 * @summary CLI command for creating a user account
 * @description Creates a new user with the provided username, email, and optional admin flag.
 * Generates a random user ID and timestamp. Demonstrates basic CRUD operations in a CLI context
 * with logging support.
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
 * List users with optional filtering
 *
 * @summary CLI command for listing and filtering users
 * @description Returns a list of users from mock data with optional filtering by admin status
 * and limit on the number of results. Demonstrates data filtering and pagination patterns
 * in CLI applications.
 */
export const listUsers = pikkuFunc<
  { limit?: number; admin?: boolean },
  { users: any[]; total: number; filtered: boolean }
>({
  func: async (services, data) => {
    // Mock user data
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
 * Process file operations
 *
 * @summary CLI command for file operations (read, info, delete)
 * @description Simulates file processing operations with support for different actions
 * (read, info, delete) and an optional backup flag. Returns processing details including
 * timestamp and mock file size. Demonstrates CLI commands with enum-based parameters
 * and optional flags.
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

    // Mock file processing
    return {
      path: data.path,
      action: data.action,
      backup: data.backup || false,
      processed: true,
      timestamp: new Date().toISOString(),
      size: Math.floor(Math.random() * 100000), // Mock file size
    }
  },
})
