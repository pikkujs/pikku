import { pikkuSessionlessFunc } from '#pikku'

export const hello = pikkuSessionlessFunc<
  { name: string; greeting?: string },
  { message: string; timestamp: number; noopCalls: number }
>({
  func: async ({ logger, noop }, data) => {
    const greeting = data.greeting || 'Hello'
    const message = `${greeting}, ${data.name}!`

    logger.info(`External package: ${message}`)

    const noopResult = noop.execute()

    return {
      message,
      timestamp: Date.now(),
      noopCalls: noopResult.callCount,
    }
  },
})
