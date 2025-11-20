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
>(async ({ logger }, data, wire) => {
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
>(async ({ logger }, data, wire) => {
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
 * Organization onboarding workflow (simple DSL)
 */
export const orgOnboardingSimpleWorkflow = pikkuSimpleWorkflowFunc<
  { email: string; name: string; plan: string; memberEmails: string[] },
  { orgId: string; ownerId?: string }
>(async ({}, data, { workflow }) => {
  // Step 1: Create organization
  const org = await workflow.do('Create organization', 'createOrg', {
    name: data.name,
  })

  // Wait for org setup to complete
  await workflow.sleep('Wait for org initialization', '2s')

  /**
   * Cancel if no members to invite
   */
  if (data.memberEmails.length === 0) {
    await workflow.cancel('No members to invite')
  }

  // Step 2: Plan-based setup using switch statement
  switch (data.plan) {
    case 'enterprise':
      await workflow.sleep('Enterprise plan setup delay', '1s')
      break
    case 'premium':
      await workflow.sleep('Premium plan setup delay', '500ms')
      break
    default:
      await workflow.sleep('Standard plan setup delay', '100ms')
      break
  }

  // Step 3: Conditional owner creation for enterprise/premium plans with complex conditions
  // Create owner if:
  // - (Enterprise plan AND has more than 5 members) OR
  // - (Premium plan AND organization name includes 'Corp')
  let owner: { id: string; orgId: string; email: string } | undefined
  if (
    (data.plan === 'enterprise' && data.memberEmails.length > 5) ||
    (data.plan === 'premium' && data.name.includes('Corp'))
  ) {
    owner = await workflow.do(
      'Create owner',
      'createOwner',
      { orgId: org.id, email: data.email },
      { retries: 3, retryDelay: '5s' }
    )

    // Wait after owner creation
    await workflow.sleep('Wait after owner setup', '1s')
  }

  // Step 4: Filter, some, and every examples
  const validEmails = data.memberEmails.filter((email) => email.includes('@'))
  // @ts-ignore - example variable
  const hasGmailUser = data.memberEmails.some((email) =>
    email.endsWith('@gmail.com')
  )
  // @ts-ignore - example variable
  const allFromSameDomain = data.memberEmails.every((email) =>
    email.endsWith('@example.com')
  )

  // Step 5: Parallel member invitations (using filtered emails)
  await Promise.all(
    validEmails.map(
      async (email) =>
        await workflow.do(`Invite member ${email}`, 'inviteMember', {
          orgId: org.id,
          email,
        })
    )
  )

  // Wait to avoid email rate limits
  await workflow.sleep('Wait before welcome email', '3s')

  // Step 6: Parallel group - send welcome email and create org (for demo)
  await Promise.all([
    workflow.do('Send welcome email', 'sendWelcomeEmail', {
      to: data.email,
      orgId: org.id,
    }),
    workflow.do('Log org creation', 'createOrg', {
      name: `${data.name} - Log Entry`,
    }),
    workflow.do('Send notification email', 'sendWelcomeEmail', {
      to: 'admin@example.com',
      orgId: org.id,
    }),
  ])

  // Return typed output
  return {
    orgId: org.id,
    ownerId: owner?.id,
  }
})

/**
 * Sequential member invitation with delays (simple DSL)
 */
export const sequentialInviteSimpleWorkflow = pikkuSimpleWorkflowFunc<
  { orgId: string; memberEmails: string[]; delayMs: number },
  { invitedCount: number }
>(async ({}, data, { workflow }) => {
  // Process members sequentially with optional delay
  for (const email of data.memberEmails) {
    await workflow.do(`Invite member ${email}`, 'inviteMember', {
      orgId: data.orgId,
      email,
    })

    if (data.delayMs > 0) {
      await workflow.sleep(
        `Wait after invitation for member ${email}`,
        `${data.delayMs}ms`
      )
    }
  }

  return {
    invitedCount: data.memberEmails.length,
  }
})

// RPC function to trigger organization onboarding simple workflow
export const triggerOrgOnboardingSimple = pikkuSessionlessFunc<
  { email: string; name: string; plan: string; memberEmails: string[] },
  { orgId: string; ownerId?: string; runId: string }
>(async ({ logger, workflowService }, data, { rpc }) => {
  // Start the workflow
  const { runId } = await rpc.startWorkflow(
    'orgOnboardingSimpleWorkflow' as any,
    data
  )

  logger.info(`[SIMPLE] Organization onboarding workflow started: ${runId}`)

  // Poll for completion (with timeout)
  const maxWaitMs = 30000 // 30 seconds
  const pollIntervalMs = 2000 // 2 seconds
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    const run = await workflowService!.getRun(runId)

    if (!run) {
      logger.error(`[SIMPLE] Workflow run not found: ${runId}`)
      throw new Error(`Workflow run not found: ${runId}`)
    }

    logger.info(`[SIMPLE] Workflow status: ${run.status}`)

    if (run.status === 'completed') {
      logger.info(`[SIMPLE] Workflow completed successfully`)
      return {
        ...run.output,
        runId,
      }
    }

    if (run.status === 'failed') {
      logger.error(`[SIMPLE] Workflow failed: ${run.error?.message}`)
      throw new Error(`Workflow failed: ${run.error?.message}`)
    }

    if (run.status === 'cancelled') {
      logger.error(`[SIMPLE] Workflow cancelled: ${run.error?.message}`)
      throw new Error(`Workflow cancelled: ${run.error?.message}`)
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error(`Workflow timed out after ${maxWaitMs}ms`)
})

// RPC function to trigger sequential invite simple workflow
export const triggerSequentialInviteSimple = pikkuSessionlessFunc<
  { orgId: string; memberEmails: string[]; delayMs: number },
  { invitedCount: number; runId: string }
>(async ({ workflowService, logger }, data, { rpc }) => {
  // Start the workflow
  const { runId } = await rpc.startWorkflow(
    'sequentialInviteSimpleWorkflow',
    data
  )

  logger.info(`[SIMPLE] Sequential invite workflow started: ${runId}`)

  // Poll for completion (with timeout)
  const maxWaitMs = 60000 // 60 seconds (longer timeout for sequential processing)
  const pollIntervalMs = 2000 // 2 seconds
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    const run = await workflowService!.getRun(runId)

    if (!run) {
      logger.error(`[SIMPLE] Workflow run not found: ${runId}`)
      throw new Error(`Workflow run not found: ${runId}`)
    }

    logger.info(`[SIMPLE] Workflow status: ${run.status}`)

    if (run.status === 'completed') {
      logger.info(`[SIMPLE] Workflow completed successfully`)
      return {
        ...run.output,
        runId,
      }
    }

    if (run.status === 'failed') {
      logger.error(`[SIMPLE] Workflow failed: ${run.error?.message}`)
      throw new Error(`Workflow failed: ${run.error?.message}`)
    }

    if (run.status === 'cancelled') {
      logger.error(`[SIMPLE] Workflow cancelled: ${run.error?.message}`)
      throw new Error(`Workflow cancelled: ${run.error?.message}`)
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error(`Workflow timed out after ${maxWaitMs}ms`)
})
