import { pikkuSessionlessFunc } from '#pikku/function'

export const countNotes = pikkuSessionlessFunc<void, { count: number }>({
  auth: false,
  func: async ({ kysely }) => {
    const row = await kysely
      .selectFrom('note')
      .select(({ fn }) => fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow()
    return { count: Number(row.count) }
  },
})
