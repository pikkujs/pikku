import { pikkuFunc, pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

// Simple greeting function
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

// Individual calculation functions for CLI
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
