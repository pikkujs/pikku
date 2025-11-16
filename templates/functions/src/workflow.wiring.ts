import { wireHTTP } from '../.pikku/pikku-types.gen.js'
import { triggerOnboardingWorkflow } from './workflow.functions.js'
import { happyRetry } from './workflow-happy.functions.js'
import { unhappyRetry } from './workflow-unhappy.functions.js'

wireHTTP({
  auth: false,
  method: 'post',
  route: '/workflow/start',
  func: triggerOnboardingWorkflow,
  tags: ['workflow'],
})

// Wire HTTP endpoints for test workflows
wireHTTP({
  auth: false,
  method: 'post',
  route: '/workflow/test/happy-retry',
  func: happyRetry,
  tags: ['workflow', 'test'],
})

wireHTTP({
  auth: false,
  method: 'post',
  route: '/workflow/test/unhappy-retry',
  func: unhappyRetry,
  tags: ['workflow', 'test'],
})
