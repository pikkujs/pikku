import {
  wireWorkflowGraph,
  graph,
} from '../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Example workflow graph: User Onboarding
 * Demonstrates sequential flow with input refs
 */
wireWorkflowGraph({
  name: 'graphOnboarding',
  triggers: {
    http: { route: '/graph-onboarding', method: 'post' },
  },
  graph: graph({
    entry: 'createUserProfile',
    sendWelcome: 'sendEmail',
  })({
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
  }),
})
