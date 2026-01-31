import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'
import { UserIdInputSchema, TodoStreamOutputSchema } from '../schemas.js'

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
