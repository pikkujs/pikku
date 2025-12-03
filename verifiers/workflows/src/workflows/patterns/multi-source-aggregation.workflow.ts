/**
 * Multi-source aggregation workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const multiSourceAggregationWorkflow = pikkuWorkflowFunc<
  { projectId: string },
  { taskCount: number; memberCount: number; commentCount: number }
>(async (_services, data, { workflow }) => {
  // Fetch from multiple sources in parallel
  const [tasks, members, _project] = await Promise.all([
    workflow.do('Get tasks', 'projectTaskList', { projectId: data.projectId }),
    workflow.do('Get members', 'projectMemberList', {
      projectId: data.projectId,
    }),
    workflow.do('Get project', 'projectGet', { projectId: data.projectId }),
  ])

  // Get comments for first few tasks in parallel
  const taskIds = tasks.tasks.slice(0, 3).map((t) => t.id)
  const commentLists = await Promise.all(
    taskIds.map(
      async (taskId) =>
        await workflow.do(`Get comments for ${taskId}`, 'taskCommentList', {
          taskId,
        })
    )
  )

  // Aggregate comment count
  const totalComments = commentLists.reduce(
    (sum, list) => sum + list.comments.length,
    0
  )

  return {
    taskCount: tasks.tasks.length,
    memberCount: members.members.length,
    commentCount: totalComments,
  }
})
