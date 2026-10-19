import { pikkuVoidFunc } from '#pikku/function'

/**
 * Notice posts whose moment has arrived and fire the handler for each.
 *
 * One pass, by design. This was a `setInterval` inside a trigger source: it
 * could not be invoked once, so nothing could test it and an operator had no
 * way to force it. The loop belonged to the scheduler all along.
 *
 * It only *notices* — the public read already compares against the clock, so
 * nothing here gates visibility.
 */
export const sweepDuePosts = pikkuVoidFunc({
  // Exposed so an operator can force a pass and a scenario can prove it works.
  expose: true,
  func: async ({ kysely, logger }, _data, { rpc }) => {
    const due = await kysely
      .selectFrom('post')
      .select(['postId', 'title'])
      .where('status', '=', 'scheduled')
      .where('publishedAt', '<=', new Date().toISOString())
      .execute()

    for (const post of due) {
      await rpc.invoke('onPostDue', post)
    }

    logger.info({ event: 'due_posts_swept', noticed: due.length })
  },
})
