import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const SendEmailInput = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
})

export const SendEmailOutput = z.object({
  id: z.string(),
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  sentAt: z.string(),
})

export const sendEmail = pikkuSessionlessFunc({
  description: 'Sends an email',
  approvalRequired: true,
  approvalDescription: async (_services, { to, subject }) => {
    return `Send an email to "${to}" with subject "${subject}"`
  },
  input: SendEmailInput,
  output: SendEmailOutput,
  func: async ({ emailStore }, { to, subject, body }) => {
    return emailStore.send(to, subject, body)
  },
})
