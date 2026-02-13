import { wireHTTP } from '#pikku'
import { graphStart } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { triggerOnboardingWorkflow } from './workflow.functions.js'

wireHTTP({
  auth: false,
  method: 'post',
  route: '/workflow/start',
  func: triggerOnboardingWorkflow,
  tags: ['workflow'],
})

wireHTTP({
  auth: false,
  method: 'post',
  route: '/workflow/graph/welcome',
  func: graphStart('graphUserWelcome', 'createProfile'),
})
