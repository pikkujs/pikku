import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

export const GetSessionInput = z.object({})

export const GetSessionOutput = z.object({
  userId: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
})

// @snippet start sessionFunction
export const getSession = pikkuFunc({
  expose: true,
  readonly: true,
  auth: true,
  description: 'Returns the current signed-in user.',
  input: GetSessionInput,
  output: GetSessionOutput,
  func: async ({ kysely }, _input, { session }) => {
    const user = await kysely
      .selectFrom('user')
      .select(['id', 'email', 'name'])
      .where('id', '=', session!.userId)
      .executeTakeFirstOrThrow()

    return {
      userId: user.id,
      email: user.email,
      name: user.name ?? null,
    }
  },
})
// @snippet end sessionFunction
