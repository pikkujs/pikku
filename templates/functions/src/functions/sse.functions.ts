import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'
import { store } from '../services/store.service.js'
import { UserIdInputSchema, TodoStreamOutputSchema } from '../schemas.js'

/**
 * SSE stream that sends todo updates periodically.
 * Demonstrates Server-Sent Events pattern.
 */
export const todoStream = pikkuSessionlessFunc({
  input: UserIdInputSchema,
  output: TodoStreamOutputSchema,
  func: async ({ logger }, { userId }, { channel }) => {
    const uid = userId || 'user1'
    logger.info(`SSE stream started for user ${uid}`)

    if (channel) {
      // Send updates every 5 seconds for demo
      let count = 0
      const interval = setInterval(async () => {
        const todos = store.getTodosByUser(uid, { completed: false })
        channel.send({
          todos,
          timestamp: new Date().toISOString(),
          count: todos.length,
        })
        count++

        // Close after 30 seconds (6 updates)
        if (count >= 6) {
          clearInterval(interval)
          channel.close()
        }
      }, 5000)
    }

    // Return initial state
    const todos = store.getTodosByUser(uid, { completed: false })
    return {
      todos,
      timestamp: new Date().toISOString(),
      count: todos.length,
    }
  },
})
