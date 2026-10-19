import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'
import { NotFoundError } from '@pikku/core/errors'

export const GetPostInput = z.object({ slug: z.string() })

export const GetPostOutput = z.object({
  postId: z.string(),
  title: z.string(),
  slug: z.string(),
  excerpt: z.string().nullable(),
  body: z.string(),
  author: z.string(),
  publishedAt: z.string().nullable(),
  readingMinutes: z.number(),
})

/**
 * One post, in full.
 *
 * A publication with no way to read a post is a list of headlines, and that is
 * what this app was: `listPublished` rendered excerpts and nothing opened them.
 *
 * Sessionless, and filtered to published-and-due rather than to a session: this
 * is the public reading surface, and "may I see this" is answered by the post's
 * own state, not by who is asking. A scheduled post is a 404 until its moment,
 * which is the same rule the index applies — enforced here too, because a reader
 * who guesses a slug must not get an early look at it.
 *
 * The view is counted by enqueueing `recordView` rather than writing here. This
 * is the hot path of a publication, and a write on it turns every reader into a
 * database round trip for a number that is allowed to be approximate.
 */
export const getPost = pikkuSessionlessFunc({
  expose: true,
  readonly: true,
  description: 'Read a published post by its slug.',
  input: GetPostInput,
  output: GetPostOutput,
  func: async ({ kysely, queueService }, { slug }) => {
    const now = new Date().toISOString()
    const post = await kysely
      .selectFrom('post')
      .innerJoin('author', 'author.authorId', 'post.authorId')
      .select([
        'post.postId',
        'post.title',
        'post.slug',
        'post.excerpt',
        'post.body',
        'post.publishedAt',
        'post.readingMinutes',
        'author.name as author',
      ])
      .where('post.slug', '=', slug)
      .where('post.status', '=', 'published')
      .where('post.publishedAt', '<=', now)
      .executeTakeFirst()

    if (!post) {
      throw new NotFoundError(`No published post at ${slug}`)
    }

    // Lossy on purpose, and never in the reader's way: a failed count must not
    // fail the read.
    await queueService?.add('record-view', { slug }).catch(() => undefined)

    return {
      postId: post.postId,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      body: post.body,
      author: post.author,
      publishedAt: post.publishedAt,
      readingMinutes: post.readingMinutes,
    }
  },
})
