import { z } from 'zod'
import { pikkuWorkflowFunc } from '#pikku/workflow'
import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/function'

// @snippet start wireWorkflow
export const StartPublishInput = z.object({ postId: z.string() })
export const StartPublishOutput = z.object({ postId: z.string(), runId: z.string() })

export const renderPost = pikkuSessionlessFunc({
  description: 'Compute the reading time and excerpt from the body.',
  func: async ({ kysely }, { postId }: { postId: string }) => {
    const post = await kysely
      .selectFrom('post')
      .select(['body'])
      .where('postId', '=', postId)
      .executeTakeFirstOrThrow()
    const words = post.body.split(/\s+/).length
    const readingMinutes = Math.max(1, Math.round(words / 220))
    await kysely
      .updateTable('post')
      .set({ readingMinutes })
      .where('postId', '=', postId)
      .execute()
    return { readingMinutes }
  },
})

export const markLive = pikkuSessionlessFunc({
  description: 'Flip the post to published.',
  func: async ({ kysely }, { postId }: { postId: string }) => {
    await kysely
      .updateTable('post')
      .set({ status: 'published', publishedAt: new Date().toISOString() })
      .where('postId', '=', postId)
      .execute()
    return { postId }
  },
})

export const announcePost = pikkuSessionlessFunc({
  description: 'Tell the newsroom it went out.',
  func: async ({ logger }, { postId }: { postId: string }) => {
    logger.info({ event: 'post_announced', postId })
  },
})

// Publishing is a workflow because the order matters and the middle step is the
// irreversible one. Rendering before marking it live means the post is never
// public with a missing reading time; announcing afterwards means nobody is
// told about something that failed to go out.
export const publishWorkflow = pikkuWorkflowFunc<
  { postId: string },
  { postId: string; readingMinutes: number }
>({
  expose: true,
  func: async (_services, data, { workflow }) => {
    const rendered = await workflow.do('Render', 'renderPost', { postId: data.postId })
    await workflow.do('Mark live', 'markLive', { postId: data.postId })
    await workflow.do('Announce', 'announcePost', { postId: data.postId })
    return { postId: data.postId, readingMinutes: rendered.readingMinutes }
  },
})
// @snippet end wireWorkflow

/**
 * The workflow's front door.
 *
 * A workflow config is not an HTTP handler, so it needs a function to start it —
 * the same shape the shop's `startCheckout` uses. Without one `publishWorkflow`
 * had no caller at all: three steps of real publishing logic that nothing could
 * begin.
 */
export const startPublish = pikkuFunc({
  expose: true,
  description: 'Run the full publish workflow for a post: render, mark live, announce.',
  input: StartPublishInput,
  output: StartPublishOutput,
  scopes: ['posts:publish'],
  func: async (_services, { postId }, { rpc }) => {
    const runId = await rpc.startWorkflow('publishWorkflow', { postId })
    return { postId, runId: String(runId) }
  },
})
