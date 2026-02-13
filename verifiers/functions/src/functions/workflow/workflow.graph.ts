import { pikkuWorkflowGraph } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const graphUserWelcome = pikkuWorkflowGraph({
  description: 'Send welcome email after user profile creation',
  tags: ['onboarding', 'graph'],
  nodes: {
    createProfile: 'createUserProfile',
    sendWelcome: 'sendEmail',
  },
  config: {
    createProfile: {
      next: 'sendWelcome',
    },
    sendWelcome: {
      input: (ref) => ({
        to: ref('createProfile', 'email'),
        subject: 'Welcome!',
        body: 'Thanks for signing up!',
      }),
    },
  },
})
