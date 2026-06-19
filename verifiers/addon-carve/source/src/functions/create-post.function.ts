import { pikkuSessionlessFunc } from '#pikku'

// Carved into the `dbpost` addon. Touches `post` (insert) and `user` (lookup) —
// so the addon owns exactly those two tables, never `auditLog`.
export const createPost = pikkuSessionlessFunc<
  { title: string; authorId: string },
  { id: string }
>({
  func: async ({ kysely }, { title, authorId }) => {
    await kysely
      .selectFrom('user')
      .where('id', '=', authorId)
      .select('id')
      .executeTakeFirstOrThrow()

    const row = await kysely
      .insertInto('post')
      .values({ id: authorId, title, authorId, published: false })
      .returning('id')
      .executeTakeFirstOrThrow()

    return { id: row.id }
  },
  expose: true,
})
