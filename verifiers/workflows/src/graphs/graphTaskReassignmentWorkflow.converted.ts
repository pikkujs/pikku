import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphTaskReassignmentWorkflow = pikkuWorkflowGraph({
  name: 'graphTaskReassignmentWorkflow',
  nodes: {
    get_current_task: 'taskGet',
    get_new_assignee: 'userGet',
    reassign_task: 'taskUpdate',
    add_reassignment_comment: 'taskCommentAdd',
    notify_previous_assignee: 'notifyEmail',
    notify_new_assignee: 'notifyEmail',
  },
  config: {
    get_current_task: {
      next: 'get_new_assignee',
      input: (ref, template) => ({
        taskId: ref('trigger', 'taskId'),
      }),
    },
    get_new_assignee: {
      next: 'reassign_task',
      input: (ref, template) => ({
        userId: ref('trigger', 'newAssigneeId'),
      }),
    },
    reassign_task: {
      input: (ref, template) => ({
        taskId: ref('trigger', 'taskId'),
        assigneeId: ref('trigger', 'newAssigneeId'),
      }),
    },
    add_reassignment_comment: {
      input: (ref, template) => ({
        taskId: ref('trigger', 'taskId'),
        content: template('Task reassigned to $0', [
          ref('get_new_assignee', 'name'),
        ]),
        authorId: 'system',
      }),
    },
    notify_previous_assignee: {
      next: 'notify_new_assignee',
      input: (ref, template) => ({
        userId: 'previous-assignee',
        subject: 'Task reassigned',
        body: template('Task $0 has been reassigned', [
          ref('get_current_task', 'title'),
        ]),
      }),
    },
    notify_new_assignee: {
      input: (ref, template) => ({
        userId: ref('trigger', 'newAssigneeId'),
        subject: 'New task assigned',
        body: template('Task $0 has been assigned to you', [
          ref('get_current_task', 'title'),
        ]),
      }),
    },
  },
})
