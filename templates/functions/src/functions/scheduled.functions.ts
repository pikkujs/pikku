import { pikkuVoidFunc } from '../../.pikku/pikku-types.gen.js'

/**
 * Scheduled task: Log daily todo summary.
 * Runs every day at 9 AM.
 */
export const dailySummary = pikkuVoidFunc(async ({ logger, todoStore }) => {
  const stats = todoStore.getStats('user1')
  const overdue = todoStore.getOverdueTodos('user1')

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

  const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  logger.info(
    `Would clean up todos completed before ${cutoffDate.toISOString()}`
  )
})
