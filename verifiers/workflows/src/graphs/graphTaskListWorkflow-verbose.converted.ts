import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphTaskListWorkflow = pikkuWorkflowGraph({
  name: 'graphTaskListWorkflow',
  tags: ['task'],
  nodes: {
    create_task_title: 'taskCreate',
    list_project_tasks: 'taskList',
  },
  config: {
    create_task_title: {
      input: (ref, template) => ({
        title: ref('$item', 'title'),
        projectId: ref('trigger', 'projectId'),
      }),
    },
    list_project_tasks: {
      input: (ref, template) => ({
        projectId: ref('trigger', 'projectId'),
      }),
    },
  },
})
