import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { currentCompanyId } from '../lib/tenant.js'

export const GetProfileOutput = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  company: z.object({
    companyId: z.string(),
    name: z.string(),
  }),
})

/**
 * Who am I, and whose board am I looking at.
 *
 * The frontend needs the company for its own chrome, and this is the only
 * place it gets it — a company id that arrives from anywhere else is a company
 * id the browser could have edited.
 */
export const getProfile = pikkuFunc({
  expose: true,
  description: 'The signed-in person and the company they work for.',
  output: GetProfileOutput,
  func: async ({ kysely }, _data, { session }) => {
    const companyId = await currentCompanyId(kysely, session.userId)
    const [user, company] = await Promise.all([
      kysely
        .selectFrom('user')
        .select(['id', 'name', 'email'])
        .where('id', '=', session.userId)
        .executeTakeFirstOrThrow(),
      kysely
        .selectFrom('company')
        .select(['companyId', 'name'])
        .where('companyId', '=', companyId)
        .executeTakeFirstOrThrow(),
    ])
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      company,
    }
  },
})
