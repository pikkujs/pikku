/**
 * Nested loop with parallel inner operations workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const nestedLoopParallelInnerWorkflow = pikkuWorkflowFunc<
  { departments: Array<{ name: string; memberIds: string[] }> },
  { totalNotified: number }
>({
  title: 'Nested Loop Parallel Inner',
  tags: ['patterns'],
  func: async (_services, data, { workflow }) => {
    let totalNotified = 0

    // Outer loop: departments (sequential)
    for (const dept of data.departments) {
      // Inner: notify all members in parallel
      await Promise.all(
        dept.memberIds.map(
          async (memberId) =>
            await workflow.do(
              `Notify ${memberId} in ${dept.name}`,
              'notifyEmail',
              {
                userId: memberId,
                subject: `Update for ${dept.name} Department`,
                body: `Important update for your department.`,
              }
            )
        )
      )

      totalNotified += dept.memberIds.length

      // Delay between departments
      await workflow.sleep(`Delay after ${dept.name}`, '100ms')
    }

    return { totalNotified }
  },
})
