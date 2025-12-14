import { pikkuSessionlessFunc } from '#pikku'
import { loggingMiddleware } from '../middleware.js'

export const queueWorker = pikkuSessionlessFunc<
  { message: string; fail: boolean },
  { result: string }
>(async ({}, data) => {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  if (data.fail) {
    throw new Error('Job failed because it was instructed to')
  }
  return { result: `echo: ${data.message}` }
})

// Example of queue worker with middleware
export const queueWorkerWithMiddleware = pikkuSessionlessFunc<
  { message: string },
  { result: string }
>({
  func: async ({ logger }, data) => {
    logger.info('Processing message with middleware support')
    return { result: `processed: ${data.message}` }
  },
  middleware: [loggingMiddleware],
})
