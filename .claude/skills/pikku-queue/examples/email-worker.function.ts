import { pikkuSessionlessFunc } from '#pikku/pikku-types.gen.js'

/**
 * Email worker function
 * This is a queue worker - NO auth or permissions needed
 */

type SendEmailIn = {
  to: string
  template: string
  data: Record<string, unknown>
}

export const sendEmail = pikkuSessionlessFunc<SendEmailIn, void>({
  docs: {
    summary: 'Send email job',
    description: 'Background worker for sending emails',
    tags: ['email', 'queue'],
    errors: ['EmailServiceError'],
  },
  // ✅ CORRECT: Destructure services in parameter list
  func: async ({ mailer }, job) => {
    await mailer.send(job.to, job.template, job.data)
  },
})
