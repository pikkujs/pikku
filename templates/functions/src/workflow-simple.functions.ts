/**
 * Example of a Simple Workflow using pikkuSimpleWorkflowFunc
 *
 * Simple workflows must conform to a restricted DSL that enables:
 * - Static analysis and visualization
 * - Deterministic metadata extraction
 * - Future code generation and optimization
 *
 * Constraints:
 * - Only workflow.do() with RPC form (no inline functions)
 * - Only if/else, for..of, and Promise.all(array.map()) control flow
 * - Step names must be unique (except across mutually exclusive branches)
 * - All workflow calls must be awaited
 */

import { pikkuSimpleWorkflowFunc } from '../.pikku/workflow/pikku-workflow-types.gen.js'
import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

// RPC function to create organization
export const createOrg = pikkuSessionlessFunc<
  { name: string },
  { id: string; name: string; createdAt: string }
>(async ({ logger }, data) => {
  logger.info(`Creating organization: ${data.name}`)
  return {
    id: `org-${Date.now()}`,
    name: data.name,
    createdAt: new Date().toISOString(),
  }
})

// RPC function to create owner
export const createOwner = pikkuSessionlessFunc<
  { orgId: string; email: string },
  { id: string; orgId: string; email: string }
>(async ({ logger }, data) => {
  logger.info(`Creating owner for org ${data.orgId}`)
  return {
    id: `owner-${Date.now()}`,
    orgId: data.orgId,
    email: data.email,
  }
})

// RPC function to invite member
export const inviteMember = pikkuSessionlessFunc<
  { orgId: string; email: string },
  { id: string; email: string; status: string }
>(async ({ logger }, data) => {
  logger.info(`Inviting member ${data.email} to org ${data.orgId}`)
  return {
    id: `member-${Date.now()}`,
    email: data.email,
    status: 'invited',
  }
})

// RPC function to send email
export const sendWelcomeEmail = pikkuSessionlessFunc<
  { to: string; orgId: string },
  { sent: boolean; messageId: string }
>(async ({ logger }, data) => {
  logger.info(`Sending welcome email to ${data.to}`)
  return {
    sent: true,
    messageId: `msg-${Date.now()}`,
  }
})

/**
 * Simple workflow for organization onboarding
 *
 * This workflow demonstrates:
 * - Sequential steps with output variables
 * - Conditional branching (if/else)
 * - Parallel fanout (Promise.all + map)
 * - Step options (retries, retryDelay)
 * - Typed inputs and outputs
 */
export const orgOnboardingSimpleWorkflow = pikkuSimpleWorkflowFunc<
  { email: string; name: string; plan: string; memberEmails: string[] },
  { orgId: string; ownerId?: string }
>(async ({ workflow }, data) => {
  // Step 1: Create organization
  const org = await workflow.do('Create organization', 'createOrg', {
    name: data.name,
  })

  // Step 2: Conditional owner creation for enterprise plans
  let owner: { id: string; orgId: string; email: string } | undefined
  if (data.plan === 'enterprise') {
    owner = await workflow.do(
      'Create owner',
      'createOwner',
      { orgId: org.id, email: data.email },
      { retries: 3, retryDelay: '5s' }
    )
  }

  // Step 3: Parallel member invitations
  await Promise.all(
    data.memberEmails.map((email) =>
      workflow.do('Invite member', 'inviteMember', { orgId: org.id, email })
    )
  )

  // Step 4: Send welcome email
  await workflow.do('Send welcome email', 'sendWelcomeEmail', {
    to: data.email,
    orgId: org.id,
  })

  // Return typed output
  return {
    orgId: org.id,
    ownerId: owner?.id,
  }
})

/**
 * Example of sequential fanout with delays
 *
 * This demonstrates:
 * - for..of loops for sequential processing
 * - Conditional sleep between iterations
 */
export const sequentialInviteSimpleWorkflow = pikkuSimpleWorkflowFunc<
  { orgId: string; memberEmails: string[]; delayMs: number },
  { invitedCount: number }
>(async ({ workflow }, data) => {
  // Process members sequentially with optional delay
  for (const email of data.memberEmails) {
    await workflow.do('Invite member', 'inviteMember', {
      orgId: data.orgId,
      email,
    })

    if (data.delayMs > 0) {
      await workflow.sleep('Wait between invitations', `${data.delayMs}ms`)
    }
  }

  return {
    invitedCount: data.memberEmails.length,
  }
})
