import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphOrgWithSubscriptionWorkflow = pikkuWorkflowGraph({
  name: 'graphOrgWithSubscriptionWorkflow',
  nodes: {
    create_admin: 'userCreate',
    create_org: 'projectCreate',
    send_welcome: 'emailSend',
  },
  config: {
    create_admin: {
      next: 'create_org',
      input: (ref, template) => ({
        email: ref('trigger', 'adminEmail'),
        name: 'Admin',
        role: 'admin',
      }),
    },
    create_org: {
      next: 'send_welcome',
      input: (ref, template) => ({
        name: ref('trigger', 'orgName'),
        ownerId: ref('create_admin', 'id'),
      }),
    },
    send_welcome: {
      input: (ref, template) => ({
        to: ref('trigger', 'adminEmail'),
        subject: template('Welcome to $0 Plan', [ref('trigger', 'plan')]),
        body: template('Your $0 organization is ready.', [
          ref('trigger', 'plan'),
        ]),
      }),
    },
  },
})
