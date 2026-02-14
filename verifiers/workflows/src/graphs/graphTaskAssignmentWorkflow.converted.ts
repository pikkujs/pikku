import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphTaskAssignmentWorkflow = pikkuWorkflowGraph({
  name: 'graphTaskAssignmentWorkflow',
  nodes: {
    get_assignee_details: 'userGet',
    create_task: 'taskCreate',
    notify_assignee: 'notifyEmail',
  },
  config: {
    get_assignee_details: {
      next: 'create_task',
      input: (ref, template) => ({
        userId: ref('trigger', 'assigneeId'),
      }),
    },
    create_task: {
      input: (ref, template) => ({
        title: ref('trigger', 'title'),
        assigneeId: ref('trigger', 'assigneeId'),
      }),
    },
    notify_assignee: {
      input: (ref, template) => ({
        userId: ref('trigger', 'assigneeId'),
        subject: template('New task assigned: $0', [ref('trigger', 'title')]),
        body: template('You have been assigned a new task: $0', [
          ref('create_task', 'title'),
        ]),
      }),
    },
  },
})
