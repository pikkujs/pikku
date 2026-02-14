import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphSequentialInviteSimpleWorkflow = pikkuWorkflowGraph({
  name: 'graphSequentialInviteSimpleWorkflow',
  nodes: {
    invite_member_email: 'inviteMember',
  },
  config: {
    invite_member_email: {
      input: (ref, template) => ({
        orgId: ref('trigger', 'orgId'),
        email: ref('$item', 'email'),
      }),
    },
  },
})
