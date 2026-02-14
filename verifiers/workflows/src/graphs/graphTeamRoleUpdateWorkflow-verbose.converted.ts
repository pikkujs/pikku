import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphTeamRoleUpdateWorkflow = pikkuWorkflowGraph({
  name: 'graphTeamRoleUpdateWorkflow',
  tags: ['onboarding'],
  nodes: {
    get_team_members: 'projectMemberList',
    remove_member: 'projectMemberRemove',
    re_add_with_new_role: 'projectMemberAdd',
    log_role_change: 'taskCommentAdd',
    notify_user: 'notifyEmail',
  },
  config: {
    get_team_members: {
      next: 'remove_member',
      input: (ref, template) => ({
        projectId: ref('trigger', 'teamId'),
      }),
    },
    remove_member: {
      next: 're_add_with_new_role',
      input: (ref, template) => ({
        projectId: ref('trigger', 'teamId'),
        userId: ref('trigger', 'userId'),
      }),
    },
    re_add_with_new_role: {
      next: 'log_role_change',
      input: (ref, template) => ({
        projectId: ref('trigger', 'teamId'),
        userId: ref('trigger', 'userId'),
        role: ref('trigger', 'newRole'),
      }),
    },
    log_role_change: {
      next: 'notify_user',
      input: (ref, template) => ({
        taskId: template('team-$0-log', [ref('trigger', 'teamId')]),
        content: template('Role changed: $0 from $1 to $2. Reason: $3', [
          ref('trigger', 'userId'),
          ref('trigger', 'previousRole'),
          ref('trigger', 'newRole'),
          ref('trigger', 'reason'),
        ]),
        authorId: 'system',
      }),
    },
    notify_user: {
      input: (ref, template) => ({
        userId: ref('trigger', 'userId'),
        subject: 'Your team role has changed',
        body: template('Your role has been updated to: $0', [
          ref('trigger', 'newRole'),
        ]),
      }),
    },
  },
})
