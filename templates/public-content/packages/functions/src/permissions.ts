import { pikkuPermission } from '#pikku/auth'

// @snippet start permissionFunction
/**
 * Wrote this post.
 *
 * Authorship depends on the row, so it cannot be a scope. It pairs with
 * `posts:write`: the scope says this person writes for the publication, the
 * permission says this is their draft. Without the second, every author could
 * edit every other author's unpublished work.
 *
 * Editors are not exempted here. An editor who needs to change somebody's draft
 * holds `posts:publish` and can act through the editorial flow — quietly
 * letting the scope override authorship would mean a writer's draft could be
 * rewritten with no trace of who did it.
 *
 * Fails closed on a missing session or a missing row rather than throwing,
 * because throwing leaks the difference between "not yours" and "does not
 * exist" — which is how somebody discovers a draft exists under a guessed slug.
 */
export const isPostAuthor = pikkuPermission(
  async ({ kysely }, { postId }: { postId: string }, { session }) => {
    if (!session) return false
    const row = await kysely
      .selectFrom('post')
      .innerJoin('author', 'author.authorId', 'post.authorId')
      .select('author.userId')
      .where('post.postId', '=', postId)
      .executeTakeFirst()
    return !!row?.userId && row.userId === session.userId
  }
)
// @snippet end permissionFunction
