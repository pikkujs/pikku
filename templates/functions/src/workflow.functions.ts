import { pikkuWorkflowFunc } from '../.pikku/workflow/pikku-workflow-types.gen.js'
import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

/**
 * Create user profile
 *
 * @summary Creates a new user profile from email and userId
 * @description This function is used as a workflow step to create user profiles. It extracts
 * the username from the email address and generates a profile with timestamp. Demonstrates
 * how regular Pikku functions can be used as workflow steps when exposed as RPCs.
 */
export const createUserProfile = pikkuSessionlessFunc<
  { email: string; userId: string },
  { id: string; email: string; name: string; createdAt: string }
>(async ({ logger }, data) => {
  logger.info(`Creating user profile for ${data.email}`)
  return {
    id: data.userId,
    email: data.email,
    name: data.email.split('@')[0]!,
    createdAt: new Date().toISOString(),
  }
})

// Helper function to generate welcome message (used inline in workflow)
function generateWelcomeMessage(email: string): string {
  return `Welcome ${email}! Your onboarding is in progress.`
}

/**
 * Send email notification
 *
 * @summary Simulates sending an email with subject and body
 * @description This function simulates email sending functionality for workflow demonstrations.
 * It logs the email details and returns a success response with a mock message ID. Used as
 * a workflow step to demonstrate asynchronous communication tasks.
 */
export const sendEmail = pikkuSessionlessFunc<
  { to: string; subject: string; body: string },
  { sent: boolean; messageId: string; to: string }
>(async ({ logger }, data) => {
  logger.info(`Sending email to ${data.to}`)
  logger.info(`Subject: ${data.subject}`)
  logger.info(`Body: ${data.body}`)
  return {
    sent: true,
    messageId: `msg-${Date.now()}`,
    to: data.to,
  }
})

/**
 * User onboarding workflow
 *
 * @summary Orchestrates a multi-step user onboarding process
 * @description This workflow demonstrates Pikku's workflow capabilities by orchestrating multiple
 * steps: creating a user profile, generating a welcome message, waiting, and sending an email.
 * It shows both RPC-based steps (durable, queue-backed) and inline steps (immediate execution
 * with caching). Includes a sleep step to demonstrate time-based workflow control.
 */
export const onboardingWorkflow = pikkuWorkflowFunc<
  { email: string; userId: string },
  { userId: string; email: string }
>(async ({ workflow }, data) => {
  // Step 1: Create user profile (RPC call - generates queue worker)
  const user = await workflow.do(
    `Create user profile in database for ${data.email}`,
    'createUserProfile',
    data
  )

  // Step 2: Generate welcome message (inline - executes immediately with caching)
  const welcomeMessage = await workflow.do(
    'Generate personalized welcome message',
    async () => generateWelcomeMessage(user.email)
  )

  // Step 3: Sleep for 5 seconds
  await workflow.sleep('Sleeping for 5 seconds', '5s')

  // Step 4: Send welcome email (RPC call - generates queue worker)
  await workflow.do('Send welcome email to user', 'sendEmail', {
    to: data.email,
    subject: 'Welcome!',
    body: welcomeMessage,
  })

  return {
    userId: data.userId,
    email: data.email,
  }
})

/**
 * Trigger and monitor onboarding workflow
 *
 * @summary HTTP endpoint that starts the onboarding workflow and polls for completion
 * @description This function demonstrates how to trigger workflows from HTTP endpoints and
 * monitor their progress. It starts the workflow via RPC, then polls the workflow service
 * to check status until completion or timeout. Returns the workflow result including all
 * step details. Shows the pattern for synchronous-like workflow invocation from HTTP requests.
 */
export const triggerOnboardingWorkflow = pikkuSessionlessFunc<
  { email: string; userId: string },
  any
>(async ({ rpc, workflowService, logger }, data) => {
  const { runId } = await rpc.startWorkflow('onboarding', data)
  logger.info(`[TEST] Workflow started: ${runId}`)

  // Poll for workflow completion
  const maxAttempts = 30
  const pollIntervalMs = 1000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const run = await workflowService!.getRun(runId)
    logger.info(`[TEST] Workflow status: ${run?.status}`)

    if (!run) {
      throw new Error(`Workflow not found: ${runId}`)
    }

    if (run.status === 'completed') {
      logger.info(`[TEST] Workflow completed successfully`)
      // Get all step attempts to return for validation
      const steps = await workflowService!.getRunHistory(runId)
      return {
        ...run.output,
        steps: steps.map((s: any) => ({
          stepName: s.stepName,
          status: s.status,
          attemptCount: s.attemptCount,
          error: s.error ? { message: s.error.message } : undefined,
        })),
      }
    }

    if (run.status === 'failed') {
      throw new Error(run.error?.message || 'Workflow failed')
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error(`Workflow timeout after ${maxAttempts} attempts`)
})
