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

    // Step 2: Process onboarding steps
    const completedSteps: string[] = []
    for (const step of data.onboardingSteps) {
      switch (step) {
        case 'verify_email':
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
          completedSteps.push('verify_email')
          break
        case 'setup_profile':
          await workflow.do('Setup profile', 'profileSetup', {
            userId: user.id,
          })
          completedSteps.push('setup_profile')
          break
        case 'welcome_email':
          await workflow.do('Send welcome', 'emailSend', {
            to: data.email,
            subject: 'Welcome!',
            body: 'Welcome to our platform.',
          })
          completedSteps.push('welcome_email')
          break
        default:
          break
      }
    }

    return {
      userId: user.id,
      completedSteps,
    }
  },
})
