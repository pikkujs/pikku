import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'

/**
 * Simple greeting function for CLI
 * Demonstrates basic CLI function with options
 */

type GreetInput = {
  name: string // from positional <name>
  loud?: boolean // from --loud/-l option
}

type GreetOutput = {
  message: string
  timestamp: string
}

export const greetUser = pikkuSessionlessFunc<GreetInput, GreetOutput>({
  docs: {
    summary: 'Greet a user by name',
    description: 'Generate a greeting message for a user',
    tags: ['cli', 'greeting'],
    errors: [],
  },
  func: async (_services, data) => {
    const message = `Hello, ${data.name}!`
    return {
      message: data.loud ? message.toUpperCase() : message,
      timestamp: new Date().toISOString(),
    }
  },
})
