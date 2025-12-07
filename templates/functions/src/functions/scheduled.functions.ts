import { pikkuVoidFunc } from '#pikku/pikku-types.gen.js'
import { store } from '../services/store.service.js'

/**
 * Scheduled task: Log daily todo summary.
 * Runs every day at 9 AM.
 */
export const dailySummary = pikkuVoidFunc(async ({ logger }) => {
  // Get stats for demo user
  const stats = store.getStats('user1')
  const overdue = store.getOverdueTodos('user1')

  const message = [
    `Daily Todo Summary (${new Date().toISOString()})`,
    `- Total: ${stats.total}`,
    `- Completed: ${stats.completed}`,
    `- Pending: ${stats.pending}`,
    `- Overdue: ${overdue.length}`,
  ].join('\n')

  logger.info(message)
})

/**
 * Scheduled task: Clean up old completed todos.
 * Runs weekly to remove todos completed more than 30 days ago.
 */
export const weeklyCleanup = pikkuVoidFunc(async ({ logger }) => {
  logger.info('Running weekly cleanup task')

  // In a real app, this would delete old completed todos
  // For demo, we just log
  const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  logger.info(
    `Would clean up todos completed before ${cutoffDate.toISOString()}`
  )
})
