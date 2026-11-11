import { pikkuSessionlessFunc } from '#pikku/function'

export const greet = pikkuSessionlessFunc<
  { name: string; greeting?: string },
  { message: string; timestamp: number; serverPort: number }
>({
  expose: true,
  func: async ({ logger, variables }, data) => {
    const greeting = data.greeting || 'Hello'
    const message = `${greeting}, ${data.name}!`
    const serverPort = parseInt((await variables.get('PORT')) || '3001', 10)

    logger.info(`Greet function called: ${message}`)

    return {
      message,
      timestamp: Date.now(),
      serverPort,
    }
  },
})

export const meshGreet = pikkuSessionlessFunc<
  { name: string; greeting?: string },
  { message: string; timestamp: number; serverPort: number }
>({
  expose: true,
  func: async ({ logger }, data, { rpc }) => {
    logger.info(`Calling greet via rpc.mesh()`)
    return await rpc.mesh('greet', data)
  },
})
