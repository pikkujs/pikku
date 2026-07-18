import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const ListContactsOutput = z.object({
  contacts: z.array(z.object({ id: z.string(), name: z.string() })),
})

export const listContacts = pikkuSessionlessFunc({
  description: 'Lists contacts from the fake CRM',
  output: ListContactsOutput,
  func: async () => {
    return { contacts: [{ id: '1', name: 'Ada Lovelace' }] }
  },
})
