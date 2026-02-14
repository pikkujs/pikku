import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphBulkMemberRemovalWorkflow = pikkuWorkflowGraph({
  name: 'graphBulkMemberRemovalWorkflow',
  nodes: {
    get_project: 'projectGet',
    remove_member_memberid: 'projectMemberRemove',
    notify_removed_member_memberid: 'notifyEmail',
  },
  config: {
    get_project: {
      next: 'remove_member_memberid',
      input: (ref, template) => ({
        projectId: ref('trigger', 'projectId'),
      }),
    },
    remove_member_memberid: {
      input: (ref, template) => ({
        projectId: ref('trigger', 'projectId'),
        userId: ref('$item', 'memberId'),
      }),
    },
    notify_removed_member_memberid: {
      input: (ref, template) => ({
        userId: ref('$item', 'memberId'),
        subject: template('You have been removed from project: $0', [
          ref('get_project', 'name'),
        ]),
        body: 'Your access to this project has been revoked.',
      }),
    },
  },
})
