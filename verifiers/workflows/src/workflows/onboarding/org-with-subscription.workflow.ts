/**
 * Organization with subscription workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const orgWithSubscriptionWorkflow = pikkuWorkflowFunc<
  {
    orgName: string
    adminEmail: string
    plan: 'free' | 'pro' | 'enterprise'
  },
  { orgId: string; planLimits: { users: number; projects: number } }
>({
  title: 'Organization with Subscription',
  tags: ['onboarding'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Create admin
    const admin = await workflow.do('Create admin', 'userCreate', {
      email: data.adminEmail,
      name: 'Admin',
      role: 'admin',
    })

    // Step 2: Create org
    const org = await workflow.do('Create org', 'projectCreate', {
      name: data.orgName,
      ownerId: admin.id,
    })

    // Step 3: Set plan limits based on subscription
    let planLimits: { users: number; projects: number }
    switch (data.plan) {
      case 'enterprise':
        planLimits = { users: -1, projects: -1 } // Unlimited
        await workflow.sleep('Enterprise setup delay', '500ms')
        break
      case 'pro':
        planLimits = { users: 50, projects: 100 }
        await workflow.sleep('Pro setup delay', '200ms')
        break
      default:
        planLimits = { users: 5, projects: 10 }
        break
    }

    // Step 4: Send plan-specific welcome
    await workflow.do('Send welcome', 'emailSend', {
      to: data.adminEmail,
      subject: `Welcome to ${data.plan} Plan`,
      body: `Your ${data.plan} organization is ready.`,
    })

    return {
      orgId: org.id,
      planLimits,
    }
  },
})
