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

// Pikku function to record completion
export const recordOnboardingComplete = pikkuSessionlessFunc<
  void,
  { completedAt: string; totalSteps: number }
>(async ({ logger }) => {
  logger.info('Recording onboarding completion')
  return {
    completedAt: new Date().toISOString(),
    totalSteps: 4,
  }
})

export const onboardingWorkflow = pikkuWorkflowFunc<
  { email: string; userId: string },
  { success: boolean; userId: string; email: string; completedAt: string }
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

  // Step 3: Send welcome email (RPC call - generates queue worker)
  await workflow.do('Send welcome email to user', 'sendEmail', {
    to: data.email,
    subject: 'Welcome!',
    body: welcomeMessage,
  })

  // Step 4: Sleep for 5 minutes before continuing
  await workflow.sleep('waitForEmailDelivery', '5min')

  // Step 5: Record completion stats (RPC call - generates queue worker)
  const stats = await workflow.do(
    'Record onboarding completion stats',
    'recordOnboardingComplete',
    null
  )

  return {
    success: true,
    userId: data.userId,
    email: data.email,
    completedAt: stats.completedAt,
  }
})
