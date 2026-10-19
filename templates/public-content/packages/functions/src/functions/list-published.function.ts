import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

export const ListPublishedInput = z.object({
  tagSlug: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})

export const ListPublishedOutput = z.object({
  posts: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      excerpt: z.string().nullable(),
      author: z.string(),
      publishedAt: z.string(),
      readingMinutes: z.number(),
    })
  ),
})

// @snippet start readFunction
/**
 * The public index. Deliberately reachable by anyone.
 *
 * This is what a correctly public function looks like, and every part of it is
 * load-bearing:
 *
 * - `pikkuSessionlessFunc`, because there is no user. A session-taking function
 *   exposed publicly would be reached with `session` undefined and would have
 *   to guard every use of it.
 * - no `scopes`. Scopes are AND-ed and an anonymous caller holds none, so a
 *   sessionless function carrying scopes rejects every caller it exists to
 *   serve. This is the check PKU574 is warning about: an exposed sessionless
 *   function with no gate is only correct when being ungated is the *point*.
 * - the gate is in the **query**, not in the caller. `status = 'published'` and
 *   `published_at <= now` are what make this safe to expose, and they are not
 *   optional filters a caller can drop.
 * - `readonly: true`, so it can never write on the hot path.
 *
 * The output shape is the second half of the answer: no `body`, no ids, no
 * author email. A public function should return the fields the public page
 * needs and nothing that happens to be on the row.
 */
export const listPublished = pikkuSessionlessFunc({
  // `expose: true` is required to get a typed client for this route, and it
  // also makes the function callable through the generic `POST /rpc/:rpcName`
  // endpoint. Those are two different decisions today and there is no way to
  // take only the first — see knowledge/decisions/internals/expose-conflates.md.
  //
  // PKU574 therefore fires on this function, correctly: it *is* reachable by
  // anyone. The safety is below — sessionless, readonly, and filtered to
  // published-and-past-its-date in the query rather than by anything a caller
  // sends — and the output carries no body, no ids and no author email.
  expose: true,
  readonly: true,
  description: 'The published posts, newest first. Public.',
  input: ListPublishedInput,
  output: ListPublishedOutput,
  func: async ({ kysely }, { tagSlug, limit }) => {
    const now = new Date().toISOString()

    let query = kysely
      .selectFrom('post')
      .innerJoin('author', 'author.authorId', 'post.authorId')
      .select([
        'post.slug',
        'post.title',
        'post.excerpt',
        'post.publishedAt',
        'post.readingMinutes',
        'author.name as author',
      ])
      // Both conditions, always. `status` alone would leak a scheduled
      // announcement the moment somebody set its date; `published_at` alone
      // would leak an archived post that still has one.
      .where('post.status', '=', 'published')
      .where('post.publishedAt', '<=', now)
      .orderBy('post.publishedAt', 'desc')
      .limit(limit)

    if (tagSlug) {
      query = query
        .innerJoin('postTag', 'postTag.postId', 'post.postId')
        .innerJoin('tag', 'tag.tagId', 'postTag.tagId')
        .where('tag.slug', '=', tagSlug)
    }

    const rows = await query.execute()

    return {
      posts: rows.map((row) => ({
        ...row,
        publishedAt: row.publishedAt!,
      })),
    }
  },
})
// @snippet end readFunction
