import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'
import { loggingMiddleware } from './middleware.js'

/**
 * @summary Process queue job with optional failure
 * @description Asynchronous queue worker that processes messages with a 1-second delay and can simulate failures for testing error handling
 */
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

/**
 * @summary Process queue job with middleware
 * @description Queue worker demonstrating middleware integration for cross-cutting concerns like logging and validation
 */
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
