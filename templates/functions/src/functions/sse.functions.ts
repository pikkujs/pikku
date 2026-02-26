import {
  pikkuFunc,
  pikkuSessionlessFunc,
} from '../../.pikku/pikku-types.gen.js'
import {
  EmptyInputSchema,
  UserIdInputSchema,
  TodoStreamOutputSchema,
  TodoProgressOutputSchema,
} from '../schemas.js'

/**
 * SSE stream that processes the authenticated user's todos and reports progress.
 * Sends started/processing events over SSE, returns complete when done.
 */
export const processTodosProgress = pikkuFunc({
  input: EmptyInputSchema,
  output: TodoProgressOutputSchema,
  func: async ({ logger, todoStore }, _input, { session, channel }) => {
    const todos = todoStore.getTodosByUser(session.userId, { completed: false })
    const total = todos.length
    logger.info(`Processing ${total} todos for user ${session.userId}`)

    if (channel) {
      channel.send({ status: 'started', processed: 0, total })
      for (let i = 0; i < todos.length; i++) {
        logger.info(`Processing todo: ${todos[i]!.title}`)
        channel.send({ status: 'processing', processed: i + 1, total })
      }
    }

    return { status: 'complete' as const, processed: total, total }
  },
})

/**
 * SSE stream that sends todo updates periodically.
 * Demonstrates Server-Sent Events pattern.
 */
export const todoStream = pikkuSessionlessFunc({
  input: UserIdInputSchema,
  output: TodoStreamOutputSchema,
  func: async ({ logger, todoStore }, { userId }, { channel }) => {
    const uid = userId || 'user1'
    logger.info(`SSE stream started for user ${uid}`)

    if (channel) {
      let count = 0
      const interval = setInterval(async () => {
        const todos = todoStore.getTodosByUser(uid, { completed: false })
        channel.send({
          todos,
          timestamp: new Date().toISOString(),
          count: todos.length,
        })
        count++

        if (count >= 6) {
          clearInterval(interval)
          channel.close()
        }
      }, 5000)
    }

    const todos = todoStore.getTodosByUser(uid, { completed: false })
    return {
      todos,
      timestamp: new Date().toISOString(),
      count: todos.length,
    }
  },
})
