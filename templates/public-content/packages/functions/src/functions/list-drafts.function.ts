import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

export const ListDraftsInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
})

export const ListDraftsOutput = z.object({
  posts: z.array(
    z.object({
      postId: z.string(),
      title: z.string(),
      status: z.string(),
      author: z.string(),
      publishedAt: z.string().nullable(),
    })
  ),
})

// @snippet start writeFunction
/**
 * The editorial list — the same table, the opposite exposure.
 *
 * Placing this next to `listPublished` is the point of the pair. One reads the
 * post table with no session and a hard-coded status filter; this one takes a
 * session and a scope and returns everything including drafts. The difference
 * between them is the entire public/private boundary of the product, and it is
 * visible in the declaration rather than buried in a branch.
 */
export const listDrafts = pikkuFunc({
  expose: true,
  readonly: true,
  description: 'Every post including drafts and scheduled ones. Staff only.',
  input: ListDraftsInput,
  output: ListDraftsOutput,
  scopes: ['posts:read'],
  func: async ({ kysely }, { limit }) => {
    const posts = await kysely
      .selectFrom('post')
      .innerJoin('author', 'author.authorId', 'post.authorId')
      .select([
        'post.postId',
        'post.title',
        'post.status',
        'post.publishedAt',
        'author.name as author',
      ])
      .orderBy('post.updatedAt', 'desc')
      .limit(limit)
      .execute()

    return { posts }
  },
})
// @snippet end writeFunction
