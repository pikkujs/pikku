import { z } from 'zod'
import { db } from 'some-database-client'
import { Limits } from './limits.js'

// Function code reaches into packages while the module loads; none of it
// touches a schema.
export const handler = db.register({ name: 'plain', run: () => db.query() })

export const Order = z.object({
  id: z.string().max(Limits.idLength),
  placedAt: z.date(),
  quantity: z.number().int().default(1),
  status: z.enum(['open', 'closed']),
})
