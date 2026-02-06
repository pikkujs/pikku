import { pikkuSessionlessFunc } from '#pikku'
import { z } from 'zod'

export const GreetInput = z.object({
  name: z.string(),
  greeting: z.string().optional(),
})

export const GreetOutput = z.object({
  message: z.string(),
  timestamp: z.number(),
  serverPort: z.number(),
})

export const greet = pikkuSessionlessFunc({
  input: GreetInput,
  output: GreetOutput,
  expose: true,
  func: async ({ logger }, data) => {
    const greeting = data.greeting || 'Hello'
    const message = `${greeting}, ${data.name}!`
    const serverPort = parseInt(process.env.PORT || '3001', 10)

    logger.info(`Greet function called: ${message}`)

    return {
      message,
      timestamp: Date.now(),
      serverPort,
    }
  },
})

export const remoteGreet = pikkuSessionlessFunc({
  input: GreetInput,
  output: GreetOutput,
  func: async ({ logger }, data, { rpc }) => {
    logger.info(`Calling greet via rpc.remote()`)
    return await rpc.remote('greet', data)
  },
})
