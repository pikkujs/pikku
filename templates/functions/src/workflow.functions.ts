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

  // Step 3: Sleep for 5 minutes
  await workflow.sleep('Sleeping for 5 minutes', '5min')

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
