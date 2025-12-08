/**
 * Project Archive Workflow
 * Demonstrates project archival with cleanup
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Project archive workflow: get tasks, notify members, archive
 */
export const projectArchiveWorkflow = pikkuWorkflowFunc<
  { projectId: string; notifyMembers: boolean },
  { archivedAt: string; taskCount: number; membersNotified: number }
>({
  title: 'Project Archive',
  tags: ['project'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Get project details
    const project = await workflow.do('Get project', 'projectGet', {
      projectId: data.projectId,
    })

    // Step 2: Get all project tasks
    const tasks = await workflow.do('Get project tasks', 'projectTaskList', {
      projectId: data.projectId,
    })

    // Step 3: Get all members
    const members = await workflow.do(
      'Get project members',
      'projectMemberList',
      {
        projectId: data.projectId,
      }
    )

    // Step 4: Notify members if requested
    let membersNotified = 0
    if (data.notifyMembers) {
      await Promise.all(
        members.members.map(async (member) => {
          await workflow.do(`Notify member ${member.userId}`, 'notifyEmail', {
            userId: member.userId,
            subject: `Project "${project.name}" is being archived`,
            body: `The project has been archived. You will no longer have access.`,
          })
          membersNotified++
        })
      )
    }

    // Step 5: Archive the project
    const archived = await workflow.do('Archive project', 'projectArchive', {
      projectId: data.projectId,
    })

    return {
      archivedAt: archived.archivedAt,
      taskCount: tasks.tasks.length,
      membersNotified,
    }
  },
})
