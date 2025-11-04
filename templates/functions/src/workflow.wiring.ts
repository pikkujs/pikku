import { wireWorkflow } from '../.pikku/workflow/pikku-workflow-types.gen.js'
import { onboardingWorkflow } from './workflow.functions.js'

wireWorkflow({
  name: 'onboarding',
  description: 'User onboarding workflow with email and profile setup',
  executionMode: 'remote', // or 'inline' for synchronous execution
  func: onboardingWorkflow,
  tags: ['onboarding', 'users'],
})
