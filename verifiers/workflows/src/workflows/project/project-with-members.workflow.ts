/**
 * Project Members Workflow
 * Demonstrates project member management
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Project with members workflow: create and invite members
 */
export const projectWithMembersWorkflow = pikkuWorkflowFunc<
  {
    name: string
    ownerId: string
    memberInvites: Array<{ userId: string; role: string }>
  },
  { projectId: string; invitedMembers: string[]; totalMembers: number }
>({
  title: 'Project With Members',
  tags: ['project'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Create the project
    const project = await workflow.do('Create project', 'projectCreate', {
      name: data.name,
      ownerId: data.ownerId,
    })

    // Step 2: Add owner as first member
    await workflow.do('Add owner', 'projectMemberAdd', {
      projectId: project.id,
      userId: data.ownerId,
      role: 'owner',
    })

    // Step 3: Invite members in parallel
    const invitedMembers: string[] = []
    await Promise.all(
      data.memberInvites.map(async (invite) => {
        await workflow.do(`Add member ${invite.userId}`, 'projectMemberAdd', {
          projectId: project.id,
          userId: invite.userId,
          role: invite.role,
        })
        invitedMembers.push(invite.userId)
      })
    )

    // Step 4: Send welcome notifications in parallel
    await Promise.all(
      data.memberInvites.map(
        async (invite) =>
          await workflow.do(`Notify member ${invite.userId}`, 'notifyEmail', {
            userId: invite.userId,
            subject: `You've been added to project: ${data.name}`,
            body: `You have been added as a ${invite.role} to the project.`,
          })
      )
    )

    // Step 5: Get final member list
    const members = await workflow.do('List members', 'projectMemberList', {
      projectId: project.id,
    })

    return {
      projectId: project.id,
      invitedMembers,
      totalMembers: members.members.length,
    }
  },
})
