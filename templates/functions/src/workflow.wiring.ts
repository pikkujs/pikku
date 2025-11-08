import { wireWorkflow } from '../.pikku/workflow/pikku-workflow-types.gen.js'
import { wireHTTP } from '../.pikku/pikku-types.gen.js'
import {
  onboardingWorkflow,
  triggerOnboardingWorkflow,
} from './workflow.functions.js'
import { happyRetryWorkflow, happyRetry } from './workflow-happy.functions.js'
import {
  unhappyRetryWorkflow,
  unhappyRetry,
} from './workflow-unhappy.functions.js'

wireWorkflow({
  name: 'onboarding',
  description: 'User onboarding workflow with email and profile setup',
  func: onboardingWorkflow,
  tags: ['onboarding', 'users'],
})

wireWorkflow({
  name: 'happyRetry',
  description: 'HAPPY PATH: Workflow that fails once then succeeds on retry',
  func: happyRetryWorkflow,
  tags: ['test', 'retry', 'happy'],
})

wireWorkflow({
  name: 'unhappyRetry',
  description: 'UNHAPPY PATH: Workflow that exhausts retries and fails',
  func: unhappyRetryWorkflow,
  tags: ['test', 'retry', 'unhappy'],
})

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
