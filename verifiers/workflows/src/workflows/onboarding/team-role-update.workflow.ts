/**
 * Team role update workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const teamRoleUpdateWorkflow = pikkuWorkflowFunc<
  { teamId: string; userId: string; newRole: string; reason: string },
  { updated: boolean; previousRole: string; newRole: string }
>({
  title: 'Team Role Update',
  tags: ['onboarding'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Get current member list
    await workflow.do('Get team members', 'projectMemberList', {
      projectId: data.teamId,
    })

    // Find current role (mock)
    const previousRole = 'member'

    // Step 2: Remove and re-add with new role
    await workflow.do('Remove member', 'projectMemberRemove', {
      projectId: data.teamId,
      userId: data.userId,
    })

    await workflow.do('Re-add with new role', 'projectMemberAdd', {
      projectId: data.teamId,
      userId: data.userId,
      role: data.newRole,
    })

    // Step 3: Add comment about role change
    await workflow.do('Log role change', 'taskCommentAdd', {
      taskId: `team-${data.teamId}-log`,
      content: `Role changed: ${data.userId} from ${previousRole} to ${data.newRole}. Reason: ${data.reason}`,
      authorId: 'system',
    })

    // Step 4: Notify user
    await workflow.do('Notify user', 'notifyEmail', {
      userId: data.userId,
      subject: 'Your team role has changed',
      body: `Your role has been updated to: ${data.newRole}`,
    })

    return {
      updated: true,
      previousRole,
      newRole: data.newRole,
    }
  },
})
