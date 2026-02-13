import { pikkuWorkflowGraph } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const graphOnboarding = pikkuWorkflowGraph({
  description: 'User onboarding workflow',
  tags: ['onboarding', 'graph'],
  nodes: {
    entry: 'userCreate',
    sendWelcome: 'emailSend',
  },
  config: {
    entry: {
      next: 'sendWelcome',
    },
    sendWelcome: {
      input: (ref) => ({
        to: ref('entry', 'email'),
        subject: 'Welcome!',
        body: 'Thanks for signing up!',
      }),
    },
  },
})
