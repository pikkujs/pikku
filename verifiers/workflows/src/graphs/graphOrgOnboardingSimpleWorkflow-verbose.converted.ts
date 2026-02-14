import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphOrgOnboardingSimpleWorkflow = pikkuWorkflowGraph({
  name: 'graphOrgOnboardingSimpleWorkflow',
  nodes: {
    create_organization: 'createOrg',
    create_owner: 'createOwner',
    invite_member_email: 'inviteMember',
    send_welcome_email: 'sendWelcomeEmail',
    send_notification_email: 'sendWelcomeEmail',
  },
  config: {
    create_organization: {
      next: 'invite_member_email',
      input: (ref, template) => ({
        name: ref('trigger', 'name'),
      }),
    },
    create_owner: {
      next: 'invite_member_email',
      input: (ref, template) => ({
        orgId: ref('create_organization', 'id'),
        email: ref('trigger', 'email'),
      }),
    },
    invite_member_email: {
      input: (ref, template) => ({
        orgId: ref('create_organization', 'id'),
        email: ref('$item', 'email'),
      }),
    },
    send_welcome_email: {
      next: 'send_notification_email',
      input: (ref, template) => ({
        to: ref('trigger', 'email'),
        orgId: ref('create_organization', 'id'),
      }),
    },
    send_notification_email: {
      input: (ref, template) => ({
        to: 'admin@example.com',
        orgId: ref('create_organization', 'id'),
      }),
    },
  },
})
