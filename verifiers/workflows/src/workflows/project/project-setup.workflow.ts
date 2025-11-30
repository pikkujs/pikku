/**
 * Project Setup Workflow
 * Demonstrates project creation with initial tasks
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Project setup workflow: create project and initial tasks
 */
export const projectSetupWorkflow = pikkuWorkflowFunc<
  {
    name: string
    description: string
    ownerId: string
    initialTasks: string[]
  },
  { projectId: string; taskIds: string[]; memberCount: number }
>(async (_services, data, { workflow }) => {
  // Step 1: Create the project
  const project = await workflow.do('Create project', 'projectCreate', {
    name: data.name,
    description: data.description,
    ownerId: data.ownerId,
  })

  // Step 2: Add owner as first member
  await workflow.do('Add owner as member', 'projectMemberAdd', {
    projectId: project.id,
    userId: data.ownerId,
    role: 'owner',
  })

  // Step 3: Create initial tasks in parallel
  const taskIds: string[] = []
  await Promise.all(
    data.initialTasks.map(async (title, index) => {
      const task = await workflow.do(`Create task ${index + 1}`, 'taskCreate', {
        title,
        projectId: project.id,
      })
      taskIds.push(task.id)
    })
  )

  // Step 4: Notify owner
  await workflow.do('Notify owner', 'notifyEmail', {
    userId: data.ownerId,
    subject: `Project "${data.name}" created`,
    body: `Your project has been created with ${data.initialTasks.length} initial tasks.`,
  })

  // Step 5: Get member count
  const members = await workflow.do('Get members', 'projectMemberList', {
    projectId: project.id,
  })

  return {
    projectId: project.id,
    taskIds,
    memberCount: members.members.length,
  }
})
