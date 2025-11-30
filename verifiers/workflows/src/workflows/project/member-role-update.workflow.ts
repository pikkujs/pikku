/**
 * Member Role Update Workflow
 * Demonstrates updating a member's role in a project
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Member role update workflow
 */
export const memberRoleUpdateWorkflow = pikkuWorkflowFunc<
  { projectId: string; userId: string; newRole: string; notifyMember: boolean },
  { updated: boolean; notified: boolean }
>(async (_services, data, { workflow }) => {
  // Step 1: Get project details
  const project = await workflow.do('Get project', 'projectGet', {
    projectId: data.projectId,
  })

  // Step 2: Remove member (to re-add with new role)
  await workflow.do('Remove member', 'projectMemberRemove', {
    projectId: data.projectId,
    userId: data.userId,
  })

  // Step 3: Re-add with new role
  await workflow.do('Re-add member with new role', 'projectMemberAdd', {
    projectId: data.projectId,
    userId: data.userId,
    role: data.newRole,
  })

  // Step 4: Conditionally notify
  let notified = false
  if (data.notifyMember) {
    await workflow.do('Notify member of role change', 'notifyEmail', {
      userId: data.userId,
      subject: `Your role has changed in project: ${project.name}`,
      body: `Your new role is: ${data.newRole}`,
    })
    notified = true
  }

  return {
    updated: true,
    notified,
  }
})
