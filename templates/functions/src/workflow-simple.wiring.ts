/**
 * Wiring for simple workflows
 */

import { wireWorkflow } from '../.pikku/workflow/pikku-workflow-types.gen.js'
import {
  orgOnboardingSimpleWorkflow,
  sequentialInviteSimpleWorkflow,
} from './workflow-simple.functions.js'

wireWorkflow({
  name: 'orgOnboardingSimple',
  description: 'Organization onboarding workflow (simple DSL)',
  func: orgOnboardingSimpleWorkflow,
  tags: ['onboarding', 'organization', 'simple'],
})

wireWorkflow({
  name: 'sequentialInviteSimple',
  description: 'Sequential member invitation with delays (simple DSL)',
  func: sequentialInviteSimpleWorkflow,
  tags: ['invitation', 'sequential', 'simple'],
})
