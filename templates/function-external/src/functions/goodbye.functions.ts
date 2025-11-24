import { pikkuSessionlessFunc } from '#pikku'

export const goodbye = pikkuSessionlessFunc<
  { name: string; farewell?: string },
  { message: string; timestamp: number; noopCalls: number }
>({
  func: async ({ logger, noop }, data) => {
    const farewell = data.farewell || 'Goodbye'
    const message = `${farewell}, ${data.name}!`

    logger.info(`External package: ${message}`)

    const noopResult = noop.execute()

    return {
      message,
      timestamp: Date.now(),
      noopCalls: noopResult.callCount,
    }
  },
})
