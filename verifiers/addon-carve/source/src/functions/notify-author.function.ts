import { pikkuSessionlessFunc } from '#pikku'

// Carved into a multi-service addon: uses `kysely` (post + user) AND two
// user-defined services (`email`, `clock`). The addon must declare all three
// as required parent services and type each on its own SingletonServices.
export const notifyAuthor = pikkuSessionlessFunc<
  { postId: string },
  { sentAt: string }
>({
  func: async ({ kysely, email, clock }, { postId }) => {
    const post = await kysely
      .selectFrom('post')
      .where('id', '=', postId)
      .select(['title', 'authorId'])
      .executeTakeFirstOrThrow()

    const author = await kysely
      .selectFrom('user')
      .where('id', '=', post.authorId)
      .select('email')
      .executeTakeFirstOrThrow()

    await email.send(author.email, 'Your post is live', post.title)
    return { sentAt: clock.now().toISOString() }
  },
  expose: true,
})
