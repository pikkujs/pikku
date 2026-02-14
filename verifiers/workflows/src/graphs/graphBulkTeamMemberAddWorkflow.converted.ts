import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphBulkTeamMemberAddWorkflow = pikkuWorkflowGraph({
  name: 'graphBulkTeamMemberAddWorkflow',
  nodes: {
    get_team: 'projectGet',
    add_userid: 'projectMemberAdd',
    send_bulk_notification: 'notifyBatch',
  },
  config: {
    get_team: {
      next: 'add_userid',
      input: (ref, template) => ({
        projectId: ref('trigger', 'teamId'),
      }),
    },
    add_userid: {
      input: (ref, template) => ({
        projectId: ref('trigger', 'teamId'),
        userId: ref('$item', 'userId'),
        role: ref('trigger', 'defaultRole'),
      }),
    },
    send_bulk_notification: {
      input: (ref, template) => ({
        userIds: ref('trigger', 'userIds'),
        channel: 'email',
        title: template('Added to $0', [ref('get_team', 'name')]),
        body: 'You have been added to the team.',
      }),
    },
  },
})
