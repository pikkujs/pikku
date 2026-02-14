import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphTaskWithCommentsWorkflow = pikkuWorkflowGraph({
  name: 'graphTaskWithCommentsWorkflow',
  nodes: {
    create_task: 'taskCreate',
    add_comment_by_comment_authorid: 'taskCommentAdd',
    list_task_comments: 'taskCommentList',
    remove_first_comment: 'taskCommentRemove',
    list_remaining_comments: 'taskCommentList',
  },
  config: {
    create_task: {
      next: 'add_comment_by_comment_authorid',
      input: (ref, template) => ({
        title: ref('trigger', 'title'),
      }),
    },
    add_comment_by_comment_authorid: {
      input: (ref, template) => ({
        taskId: ref('create_task', 'id'),
      }),
    },
    list_task_comments: {
      next: 'list_remaining_comments',
      input: (ref, template) => ({
        taskId: ref('create_task', 'id'),
      }),
    },
    remove_first_comment: {
      next: 'list_remaining_comments',
      input: (ref, template) => ({
        taskId: ref('create_task', 'id'),
      }),
    },
    list_remaining_comments: {
      input: (ref, template) => ({
        taskId: ref('create_task', 'id'),
      }),
    },
  },
})
