import { pikkuFunc, pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

// Simple greeting function
export const greetUser = pikkuSessionlessFunc<
  { name: string; loud: boolean },
  { message: string; timestamp: string }
>({
  func: async (_services, { name, loud }) => {
    const message = `Hello, ${name}!`
    return {
      message: loud ? message.toUpperCase() : message,
      timestamp: new Date().toISOString(),
    }
  },
})

// Individual calculation functions for CLI
export const addNumbers = pikkuFunc<
  { a: number; b: number },
  { operation: string; operands: number[]; result: number; expression: string }
>({
  func: async (_services, { a, b }) => {
    const result = a + b
    return {
      operation: 'add',
      operands: [a, b],
      result,
      expression: `${a} + ${b} = ${result}`,
    }
  },
})

export const subtractNumbers = pikkuFunc<
  { a: number; b: number },
  { operation: string; operands: number[]; result: number; expression: string }
>({
  func: async (_services, { a, b }) => {
    const result = a - b
    return {
      operation: 'subtract',
      operands: [a, b],
      result,
      expression: `${a} - ${b} = ${result}`,
    }
  },
})

export const multiplyNumbers = pikkuFunc<
  { a: number; b: number },
  { operation: string; operands: number[]; result: number; expression: string }
>({
  func: async (_services, { a, b }) => {
    const result = a * b
    return {
      operation: 'multiply',
      operands: [a, b],
      result,
      expression: `${a} * ${b} = ${result}`,
    }
  },
})

export const divideNumbers = pikkuFunc<
  { a: number; b: number },
  { operation: string; operands: number[]; result: number; expression: string }
>({
  func: async (_services, { a, b }) => {
    if (b === 0) {
      throw new Error('Division by zero is not allowed')
    }
    const result = a / b
    return {
      operation: 'divide',
      operands: [a, b],
      result,
      expression: `${a} / ${b} = ${result}`,
    }
  },
})

// User management functions
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
  func: async (services, { username, email, admin }) => {
    services.logger.info(`Creating user: ${username}`)

    return {
      id: Math.floor(Math.random() * 10000),
      username,
      email,
      admin: admin || false,
      created: new Date().toISOString(),
    }
  },
})

export const listUsers = pikkuFunc<
  { limit?: number; admin?: boolean },
  { users: any[]; total: number; filtered: boolean }
>({
  func: async (_services, { limit, admin }) => {
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

    if (admin !== undefined) {
      users = users.filter((user) => user.admin === admin)
    }

    if (limit) {
      users = users.slice(0, limit)
    }

    return {
      users,
      total: users.length,
      filtered: admin !== undefined || limit !== undefined,
    }
  },
})

// File operations
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
  func: async (services, { path, action, backup }) => {
    services.logger.info(`Processing file: ${path} with action: ${action}`)

    // Mock file processing
    return {
      path,
      action,
      backup: backup || false,
      processed: true,
      timestamp: new Date().toISOString(),
      size: Math.floor(Math.random() * 100000), // Mock file size
    }
  },
})
