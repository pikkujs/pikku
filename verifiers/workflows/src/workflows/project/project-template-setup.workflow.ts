/**
 * Project Template Setup Workflow
 * Demonstrates project creation from templates (basic, agile, waterfall)
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Project template setup workflow
 */
export const projectTemplateSetupWorkflow = pikkuWorkflowFunc<
  {
    name: string
    ownerId: string
    template: 'basic' | 'agile' | 'waterfall'
  },
  { projectId: string; taskCount: number }
>({
  title: 'Project Template Setup',
  tags: ['project'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Create the project
    const project = await workflow.do('Create project', 'projectCreate', {
      name: data.name,
      ownerId: data.ownerId,
    })

    // Step 2: Create tasks based on template
    let taskCount = 0
    switch (data.template) {
      case 'agile':
        await workflow.do('Create backlog task', 'taskCreate', {
          title: 'Set up product backlog',
          projectId: project.id,
        })
        await workflow.do('Create sprint task', 'taskCreate', {
          title: 'Plan first sprint',
          projectId: project.id,
        })
        await workflow.do('Create standup task', 'taskCreate', {
          title: 'Schedule daily standups',
          projectId: project.id,
        })
        taskCount = 3
        break
      case 'waterfall':
        await workflow.do('Create requirements task', 'taskCreate', {
          title: 'Gather requirements',
          projectId: project.id,
        })
        await workflow.do('Create design task', 'taskCreate', {
          title: 'Create design documents',
          projectId: project.id,
        })
        await workflow.do('Create implementation task', 'taskCreate', {
          title: 'Implementation phase',
          projectId: project.id,
        })
        await workflow.do('Create testing task', 'taskCreate', {
          title: 'Testing phase',
          projectId: project.id,
        })
        taskCount = 4
        break
      default:
        await workflow.do('Create kickoff task', 'taskCreate', {
          title: 'Project kickoff',
          projectId: project.id,
        })
        await workflow.do('Create planning task', 'taskCreate', {
          title: 'Initial planning',
          projectId: project.id,
        })
        taskCount = 2
        break
    }

    return {
      projectId: project.id,
      taskCount,
    }
  },
})
