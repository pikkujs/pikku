import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { currentCompanyId } from '../../lib/tenant.js'

export const ListCustomersOutput = z.object({
  customers: z.array(
    z.object({
      customerId: z.string(),
      name: z.string(),
      address: z.string(),
      phone: z.string().nullable(),
    })
  ),
})

export const listCustomers = pikkuFunc({
  expose: true,
  description: 'List the sites this company works on.',
  output: ListCustomersOutput,
  scopes: ['customers:read'],
  func: async ({ kysely }, _data, { session }) => {
    const companyId = await currentCompanyId(kysely, session.userId)
    const customers = await kysely
      .selectFrom('customer')
      .select(['customerId', 'name', 'address', 'phone'])
      .where('companyId', '=', companyId)
      .orderBy('name', 'asc')
      .execute()
    return { customers }
  },
})
