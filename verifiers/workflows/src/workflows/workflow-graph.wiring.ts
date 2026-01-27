import {
  pikkuWorkflowGraph,
  wireWorkflow,
} from '#pikku/workflow/pikku-workflow-types.gen.js'
import { wireHTTP } from '#pikku'

/**
 * Example workflow graph: User Onboarding
 * Demonstrates sequential flow with input refs
 * Name is inferred from the exported variable name
 */
export const graphOnboarding = pikkuWorkflowGraph({
  description: 'User onboarding workflow',
  tags: ['onboarding', 'graph'],
  nodes: {
    entry: 'userCreate',
    sendWelcome: 'emailSend',
  },
  wires: {
    http: [
      {
        route: '/workflow/graph-onboarding',
        method: 'post',
        startNode: 'entry',
      },
    ],
    channel: [
      {
        name: 'workflow-graph-onboarding',
        onConnect: 'entry',
        onDisconnect: 'entry',
        onMessage: 'sendWelcome',
      },
    ],
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

/**
 * Wire the graph workflow to enable its wires
 * enabled: true (default) allows the workflow to be triggered
 */
wireWorkflow({
  enabled: true,
  graph: graphOnboarding,
})

/**
 * HTTP endpoint to trigger the graph workflow
 * workflow: true means it directly triggers the workflow without a separate function
 */
wireHTTP({
  method: 'post',
  route: '/workflow/graph-onboarding',
  workflow: true,
})

// TODO: Enable when channel workflow triggers are implemented
// /**
//  * Channel endpoint to trigger the graph workflow
//  * workflow: true means it directly triggers the workflow without a separate function
//  */
// wireChannel({
//   name: 'workflow-graph-onboarding',
//   workflow: true,
// })
