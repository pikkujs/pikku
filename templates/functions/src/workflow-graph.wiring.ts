import {
  pikkuWorkflowGraph,
  wireWorkflow,
} from '../.pikku/workflow/pikku-workflow-types.gen.js'
import { wireHTTP } from '../.pikku/pikku-types.gen.js'

/**
 * Example workflow graph: User Onboarding
 * Demonstrates sequential flow with input refs
 * Name is inferred from the exported variable name
 */
export const graphOnboarding = pikkuWorkflowGraph({
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
    http: { route: '/workflow/graph-onboarding', method: 'post' },
  },
  graph: graphOnboarding,
})

/**
 * HTTP endpoint to trigger the graph workflow
 * workflow: true means it directly triggers the workflow without a separate function
 */
wireHTTP({
  auth: false,
  method: 'post',
  route: '/workflow/graph-onboarding',
  workflow: true,
  tags: ['workflow', 'graph'],
})
