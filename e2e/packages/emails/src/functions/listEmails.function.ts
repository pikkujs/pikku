import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const ListEmailsInput = z.object({})

export const ListEmailsOutput = z.object({
  emails: z.array(
    z.object({
      id: z.string(),
      to: z.string(),
      subject: z.string(),
      body: z.string(),
      sentAt: z.string(),
    })
  ),
})

export const listEmails = pikkuSessionlessFunc({
  description: 'Lists all emails',
  input: ListEmailsInput,
  output: ListEmailsOutput,
  func: async ({ emailStore }) => {
    return { emails: emailStore.list() }
  },
})
