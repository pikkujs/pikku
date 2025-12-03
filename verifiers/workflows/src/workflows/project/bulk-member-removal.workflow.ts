/**
 * Bulk Member Removal Workflow
 * Demonstrates removing multiple members from a project
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Bulk member removal workflow
 */
export const bulkMemberRemovalWorkflow = pikkuWorkflowFunc<
  { projectId: string; memberIds: string[]; notifyMembers: boolean },
  { removedCount: number; notifiedCount: number }
>({
  title: 'Bulk Member Removal',
  tags: ['project'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Get project details
    const project = await workflow.do('Get project', 'projectGet', {
      projectId: data.projectId,
    })

    // Step 2: Remove members in parallel
    await Promise.all(
      data.memberIds.map(
        async (memberId) =>
          await workflow.do(
            `Remove member ${memberId}`,
            'projectMemberRemove',
            {
              projectId: data.projectId,
              userId: memberId,
            }
          )
      )
    )

    // Step 3: Optionally notify removed members
    let notifiedCount = 0
    if (data.notifyMembers) {
      await Promise.all(
        data.memberIds.map(async (memberId) => {
          await workflow.do(
            `Notify removed member ${memberId}`,
            'notifyEmail',
            {
              userId: memberId,
              subject: `You have been removed from project: ${project.name}`,
              body: 'Your access to this project has been revoked.',
            }
          )
          notifiedCount++
        })
      )
    }

    return {
      removedCount: data.memberIds.length,
      notifiedCount,
    }
  },
})
