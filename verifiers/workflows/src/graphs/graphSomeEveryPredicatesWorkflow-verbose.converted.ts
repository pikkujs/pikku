import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphSomeEveryPredicatesWorkflow = pikkuWorkflowGraph({
  name: 'graphSomeEveryPredicatesWorkflow',
  tags: ['patterns'],
  nodes: {
    get_user_userid: 'userGet',
    notify_approval: 'notifySlack',
    notify_blocked: 'notifySlack',
  },
  config: {
    get_user_userid: {
      input: (ref, template) => ({
        userId: ref('$item', 'userId'),
      }),
    },
    notify_approval: {
      input: () => ({
        channel: '#approvals',
        message: 'All conditions met - proceeding with operation',
      }),
    },
    notify_blocked: {
      input: (ref, template) => ({
        channel: '#approvals',
        message: template('Operation blocked - hasAdmin: $0, allVerified: $1', [
          ref('step_1'),
          ref('step_2'),
        ]),
      }),
    },
  },
})
