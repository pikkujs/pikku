import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'
import { store } from '../services/store.service.js'
import {
  ProcessReminderInputSchema,
  ProcessReminderOutputSchema,
} from '../schemas.js'

/**
 * Queue worker: Process todo reminder jobs.
 */
export const processReminder = pikkuSessionlessFunc({
  input: ProcessReminderInputSchema,
  output: ProcessReminderOutputSchema,
  func: async ({ logger }, { todoId, userId }) => {
    logger.info(`Processing reminder for todo ${todoId}, user ${userId}`)

    const todo = store.getTodo(todoId)
    if (!todo) {
      return {
        processed: false,
        message: `Todo ${todoId} not found`,
      }
    }

    if (todo.completed) {
      return {
        processed: true,
        message: `Todo ${todoId} already completed, skipping reminder`,
      }
    }

    // In a real app, this would send an actual notification
    logger.info(`Reminder: Todo "${todo.title}" is due!`)

    return {
      processed: true,
      message: `Reminder sent for todo: ${todo.title}`,
    }
  },
})
