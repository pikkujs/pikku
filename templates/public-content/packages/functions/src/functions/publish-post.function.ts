import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

export const PublishPostInput = z.object({
  postId: z.string(),
  publishAt: z.string().optional(),
})

export const PublishPostOutput = z.object({
  postId: z.string(),
  status: z.string(),
  publishedAt: z.string(),
})

// @snippet start scopedFunction
/**
 * The one-way door.
 *
 * `posts:publish` is held by editors and not by authors, because publishing is
 * the irreversible step: the moment a post is public it has been read, and
 * unpublishing does not unsee it. Giving the irreversible action its own scope
 * means "who can make something public" is answerable from the role
 * declaration rather than by reading this function.
 */
export const publishPost = pikkuFunc({
  expose: true,
  description: 'Publish a post now, or schedule it for later.',
  input: PublishPostInput,
  output: PublishPostOutput,
  scopes: ['posts:publish'],
  audit: true,
  func: async ({ kysely, eventHub, queueService }, { postId, publishAt }, { session }) => {
    const post = await kysely
      .selectFrom('post')
      .select(['postId', 'status'])
      .where('postId', '=', postId)
      .executeTakeFirstOrThrow()

    if (post.status === 'archived') {
      throw new Error('Cannot publish an archived post')
    }

    const when = publishAt ?? new Date().toISOString()
    // Dated forward means scheduled, not published. The public read compares
    // against the clock, so the two agree without a second flag to keep in sync.
    const status = when > new Date().toISOString() ? 'scheduled' : 'published'

    await kysely
      .updateTable('post')
      .set({ status, publishedAt: when, updatedAt: new Date().toISOString() })
      .where('postId', '=', postId)
      .execute()

    await eventHub?.publish('editorial', null, { type: 'post-published', postId, status })
    // Publishing is precisely the kind of event `writeAuditEvent` exists for:
    // it is a state change a person made deliberately, and the row it leaves
    // behind is the one an investigation asks for. The worker was wired to a
    // queue nothing ever pushed to.
    await queueService
      ?.add('audit-event', {
        entityType: 'post',
        entityId: postId,
        action: 'published',
        ...(session?.userId ? { actorId: session.userId } : {}),
      })
      .catch(() => undefined)


    return { postId, status, publishedAt: when }
  },
})
// @snippet end scopedFunction
