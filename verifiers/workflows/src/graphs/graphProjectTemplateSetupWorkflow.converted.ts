import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphProjectTemplateSetupWorkflow = pikkuWorkflowGraph({
  name: 'graphProjectTemplateSetupWorkflow',
  nodes: {
    create_project: 'projectCreate',
    create_backlog_task: 'taskCreate',
    create_sprint_task: 'taskCreate',
    create_standup_task: 'taskCreate',
    create_requirements_task: 'taskCreate',
    create_design_task: 'taskCreate',
    create_implementation_task: 'taskCreate',
    create_testing_task: 'taskCreate',
    create_kickoff_task: 'taskCreate',
    create_planning_task: 'taskCreate',
  },
  config: {
    create_project: {
      input: (ref, template) => ({
        name: ref('trigger', 'name'),
        ownerId: ref('trigger', 'ownerId'),
      }),
    },
    create_backlog_task: {
      next: 'create_sprint_task',
      input: (ref, template) => ({
        title: 'Set up product backlog',
        projectId: ref('create_project', 'id'),
      }),
    },
    create_sprint_task: {
      next: 'create_standup_task',
      input: (ref, template) => ({
        title: 'Plan first sprint',
        projectId: ref('create_project', 'id'),
      }),
    },
    create_standup_task: {
      input: (ref, template) => ({
        title: 'Schedule daily standups',
        projectId: ref('create_project', 'id'),
      }),
    },
    create_requirements_task: {
      next: 'create_design_task',
      input: (ref, template) => ({
        title: 'Gather requirements',
        projectId: ref('create_project', 'id'),
      }),
    },
    create_design_task: {
      next: 'create_implementation_task',
      input: (ref, template) => ({
        title: 'Create design documents',
        projectId: ref('create_project', 'id'),
      }),
    },
    create_implementation_task: {
      next: 'create_testing_task',
      input: (ref, template) => ({
        title: 'Implementation phase',
        projectId: ref('create_project', 'id'),
      }),
    },
    create_testing_task: {
      input: (ref, template) => ({
        title: 'Testing phase',
        projectId: ref('create_project', 'id'),
      }),
    },
    create_kickoff_task: {
      next: 'create_planning_task',
      input: (ref, template) => ({
        title: 'Project kickoff',
        projectId: ref('create_project', 'id'),
      }),
    },
    create_planning_task: {
      input: (ref, template) => ({
        title: 'Initial planning',
        projectId: ref('create_project', 'id'),
      }),
    },
  },
})
