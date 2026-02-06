import { wireHTTP, graph } from '#pikku'
import { wireWorkflowGraph } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { triggerOnboardingWorkflow } from './workflow.functions.js'

wireHTTP({
  auth: false,
  method: 'post',
  route: '/workflow/start',
  func: triggerOnboardingWorkflow,
  tags: ['workflow'],
})

export const graphUserWelcome = wireWorkflowGraph({
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

wireHTTP({
  auth: false,
  method: 'post',
  route: '/workflow/graph/welcome',
  func: graph('graphUserWelcome', 'createProfile'),
})
