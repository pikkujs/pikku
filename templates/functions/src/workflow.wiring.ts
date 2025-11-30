import { wireHTTP } from '../.pikku/pikku-types.gen.js'
import {
  pikkuWorkflowGraph,
  wireWorkflow,
} from '../.pikku/workflow/pikku-workflow-types.gen.js'
import { triggerOnboardingWorkflow } from './workflow.functions.js'

// HTTP endpoint to trigger the onboarding workflow
wireHTTP({
  auth: false,
  method: 'post',
  route: '/workflow/start',
  func: triggerOnboardingWorkflow,
  tags: ['workflow'],
})

/**
 * Graph Workflow Example: User Welcome
 *
 * Graph workflows are defined declaratively with:
 * - nodes: Map step IDs to RPC function names
 * - config: Define input mappings and flow (next, onError)
 * - wires: HTTP/channel triggers
 */
export const graphUserWelcome = pikkuWorkflowGraph({
  description: 'Send welcome email after user profile creation',
  tags: ['onboarding', 'graph'],
  nodes: {
    createProfile: 'createUserProfile',
    sendWelcome: 'sendEmail',
  },
  wires: {
    http: [
      {
        route: '/workflow/graph/welcome',
        method: 'post',
        startNode: 'createProfile',
      },
    ],
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

// Register the graph workflow
wireWorkflow({
  graph: graphUserWelcome,
})

// HTTP endpoint for graph workflow
wireHTTP({
  method: 'post',
  route: '/workflow/graph/welcome',
  workflow: true,
})
