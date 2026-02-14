import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphTaskWithTagsWorkflow = pikkuWorkflowGraph({
  name: 'graphTaskWithTagsWorkflow',
  tags: ['task'],
  nodes: {
    create_task: 'taskCreate',
    add_tag_tag: 'taskTagAdd',
  },
  config: {
    create_task: {
      next: 'add_tag_tag',
      input: (ref, template) => ({
        title: ref('trigger', 'title'),
      }),
    },
    add_tag_tag: {
      input: (ref, template) => ({
        taskId: ref('create_task', 'id'),
        tag: ref('$item', 'tag'),
      }),
    },
  },
})
