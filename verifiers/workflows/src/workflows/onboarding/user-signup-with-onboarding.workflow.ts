/**
 * User signup with onboarding steps workflow
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const userSignupWithOnboardingWorkflow = pikkuWorkflowFunc<
  { email: string; name: string; onboardingSteps: string[] },
  { userId: string; completedSteps: string[] }
>({
  title: 'User Signup with Onboarding',
  tags: ['onboarding'],
  func: async (_services, data, { workflow }) => {
    // Step 1: Create user
    const user = await workflow.do('Create user', 'userCreate', {
      email: data.email,
      name: data.name,
    })

    // Step 2: Process onboarding steps. A DSL fanout body is a flat list of
    // steps with no branch member, so the "which onboarding step is this?"
    // switch becomes one filtered fanout per step kind — `.filter` is how the
    // DSL expresses a per-item condition. Consequence worth knowing: the kinds
    // run grouped in the order written here, not interleaved in the caller's
    // `onboardingSteps` order.
    const completedSteps: string[] = []

    const verifyEmailSteps = data.onboardingSteps.filter(
      (step) => step === 'verify_email'
    )
    for (const step of verifyEmailSteps) {
      const verification = await workflow.do(
        'Send verification',
        'userSendVerificationEmail',
        {
          userId: user.id,
          email: data.email,
        }
      )
      await workflow.do('Verify email', 'userVerify', {
        userId: user.id,
        token: verification.token,
      })
      completedSteps.push(step)
    }

    const setupProfileSteps = data.onboardingSteps.filter(
      (step) => step === 'setup_profile'
    )
    for (const step of setupProfileSteps) {
      await workflow.do('Setup profile', 'profileSetup', {
        userId: user.id,
      })
      completedSteps.push(step)
    }

    const welcomeEmailSteps = data.onboardingSteps.filter(
      (step) => step === 'welcome_email'
    )
    for (const step of welcomeEmailSteps) {
      await workflow.do('Send welcome', 'emailSend', {
        to: data.email,
        subject: 'Welcome!',
        body: 'Welcome to our platform.',
      })
      completedSteps.push(step)
    }

    return {
      userId: user.id,
      completedSteps,
    }
  },
})
