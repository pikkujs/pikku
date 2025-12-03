/**
 * Bulk team member addition workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const bulkTeamMemberAddWorkflow = pikkuWorkflowFunc<
  { teamId: string; userIds: string[]; defaultRole: string },
  { addedCount: number; notifiedCount: number }
>(async (_services, data, { workflow }) => {
  // Step 1: Get team details
  const team = await workflow.do('Get team', 'projectGet', {
    projectId: data.teamId,
  })

  // Step 2: Add all members
  let addedCount = 0
  for (const userId of data.userIds) {
    await workflow.do(`Add ${userId}`, 'projectMemberAdd', {
      projectId: data.teamId,
      userId,
      role: data.defaultRole,
    })
    addedCount++
  }

  // Step 3: Send bulk notification
  await workflow.do('Send bulk notification', 'notifyBatch', {
    userIds: data.userIds,
    channel: 'email',
    title: `Added to ${team.name}`,
    body: 'You have been added to the team.',
  })

  return {
    addedCount,
    notifiedCount: data.userIds.length,
  }
})
