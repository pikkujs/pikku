import {
  pikkuWorkflowGraph,
  wireWorkflow,
} from '../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Example workflow graph: User Onboarding
 * Demonstrates sequential flow with input refs
 */
export const graphOnboarding = pikkuWorkflowGraph({
  name: 'graphOnboarding',
  description: 'User onboarding workflow',
  tags: ['onboarding', 'graph'],
  nodes: {
    entry: 'createUserProfile',
    sendWelcome: 'sendEmail',
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

wireWorkflow({
  wires: {
    http: { route: '/graph-onboarding', method: 'post' },
  },
  graph: graphOnboarding,
})
