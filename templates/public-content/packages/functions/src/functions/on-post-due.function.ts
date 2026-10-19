import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

export const PostDuePayload = z.object({
  postId: z.string(),
  title: z.string(),
})

export const onPostDue = pikkuSessionlessFunc({
  expose: false,
  description: 'Fires when a scheduled post reaches its publication time.',
  input: PostDuePayload,
  func: async ({ logger }, { postId, title }) => {
    logger.info({ event: 'scheduled_post_due', postId, title })
  },
})
