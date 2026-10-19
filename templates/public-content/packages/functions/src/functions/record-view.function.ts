import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

export const RecordViewInput = z.object({ slug: z.string() })

/**
 * Queued rather than counted on the read.
 *
 * The public index is the hot path in a publication, and a write on it turns
 * every reader into a database round trip. Counting is also the one thing here
 * that may be lossy — an undercounted view is a rounding error, whereas a slow
 * page is the product being bad.
 */
// @snippet start queueWorkerFunction
export const recordView = pikkuSessionlessFunc({
  description: 'Increment the view counter for a post.',
  input: RecordViewInput,
  func: async ({ kysely }, { slug }) => {
    const post = await kysely
      .selectFrom('post')
      .select('postId')
      .where('slug', '=', slug)
      .where('status', '=', 'published')
      .executeTakeFirst()

    // Silently ignore an unknown or unpublished slug. This is reachable from
    // the public internet, so it must not become a way to ask whether a draft
    // exists under a guessed name.
    if (!post) return

    await kysely
      .insertInto('postView')
      .values({ postId: post.postId, views: 1 })
      .onConflict((oc) =>
        oc.column('postId').doUpdateSet((eb) => ({ views: eb('postView.views', '+', 1) }))
      )
      .execute()
  },
})
// @snippet end queueWorkerFunction
