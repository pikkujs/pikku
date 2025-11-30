/**
 * Parallel Aggregation Workflow
 * Demonstrates fan-out, collect, and aggregate patterns
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Fan-out and aggregate workflow
 */
export const fanOutAggregateWorkflow = pikkuWorkflowFunc<
  { userIds: string[] },
  { totalUsers: number; activeCount: number; inactiveCount: number }
>(async (_services, data, { workflow }) => {
  // Fan-out: Get all users in parallel
  const users = await Promise.all(
    data.userIds.map(
      async (userId) =>
        await workflow.do(`Get user ${userId}`, 'userGet', { userId })
    )
  )

  // Aggregate: Count by status
  const activeCount = users.filter((u) => u.status === 'active').length
  const inactiveCount = users.filter((u) => u.status !== 'active').length

  return {
    totalUsers: users.length,
    activeCount,
    inactiveCount,
  }
})
