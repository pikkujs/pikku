/**
 * Multi-tier switch workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const multiTierSwitchWorkflow = pikkuWorkflowFunc<
  { tier: 'free' | 'basic' | 'pro' | 'enterprise'; action: string },
  { allowed: boolean; features: string[] }
>(async (_services, data, { workflow }) => {
  const features: string[] = []
  let allowed = true

  switch (data.tier) {
    case 'enterprise':
      features.push(
        'unlimited-users',
        'custom-integrations',
        'dedicated-support',
        'sla'
      )
      await workflow.sleep('Enterprise setup', '200ms')
      break

    case 'pro':
      features.push('unlimited-users', 'basic-integrations', 'priority-support')
      await workflow.sleep('Pro setup', '100ms')
      break

    case 'basic':
      features.push('5-users', 'email-support')
      await workflow.sleep('Basic setup', '50ms')
      break

    case 'free':
      features.push('1-user', 'community-support')
      // Some actions not allowed on free tier
      if (data.action === 'export' || data.action === 'api-access') {
        allowed = false
        await workflow.do('Notify upgrade required', 'notifyInApp', {
          userId: 'current-user',
          title: 'Upgrade Required',
          body: `The ${data.action} feature requires a paid plan.`,
        })
      }
      break

    default:
      allowed = false
  }

  return { allowed, features }
})
