import { pikkuWorkflowFunc } from '../.pikku/workflow/pikku-workflow-types.gen.js'
import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

// Pikku function to create a user profile
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

// Pikku function to send email (simulated)
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

// HTTP function to start a workflow and poll until completion
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
