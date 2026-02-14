import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const graphUserSignupWithOnboardingWorkflow = pikkuWorkflowGraph({
  name: 'graphUserSignupWithOnboardingWorkflow',
  nodes: {
    create_user: 'userCreate',
  },
  config: {
    create_user: {
      input: (ref, template) => ({
        email: ref('trigger', 'email'),
        name: ref('trigger', 'name'),
      }),
    },
  },
})
