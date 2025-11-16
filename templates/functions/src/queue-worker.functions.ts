import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'
import { loggingMiddleware } from './middleware.js'

/**
 * Basic queue worker with simulated processing and error handling
 *
 * @summary Processes queue jobs with a 1-second delay and optional failure simulation
 * @description This queue worker demonstrates asynchronous job processing in Pikku.
 * It simulates processing time with a 1-second delay and can intentionally fail based
 * on the 'fail' flag in the input data. This is useful for testing error handling and
 * retry mechanisms in queue-based systems.
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
 * Queue worker with middleware support
 *
 * @summary Example of a queue worker that uses middleware for logging
 * @description This function demonstrates how to attach middleware to queue workers in Pikku.
 * The loggingMiddleware runs before the worker function, providing consistent logging across
 * all queue jobs. This pattern is useful for cross-cutting concerns like authentication,
 * metrics collection, or request tracing.
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
