import { pikkuVoidFunc } from '#pikku/function'

/**
 * Scheduled posts whose moment has arrived.
 *
 * The public read already compares `published_at` against the clock, so a
 * scheduled post becomes visible on time whether or not this runs. This exists
 * to make `status` agree with reality, so the editorial list stops calling a
 * live post "scheduled" — the read is correct either way, and the humans should
 * not have to hold that distinction in their heads.
 */
// @snippet start scheduledFunction
// @snippet start cleanupFunction
export const publishScheduled = pikkuVoidFunc({
  expose: true,
  func: async ({ kysely, logger }) => {
    const result = await kysely
      .updateTable('post')
      .set({ status: 'published' })
      .where('status', '=', 'scheduled')
      .where('publishedAt', '<=', new Date().toISOString())
      .executeTakeFirst()

    logger.info({ event: 'scheduled_published', published: Number(result.numUpdatedRows ?? 0) })
  },
})
// @snippet end cleanupFunction
// @snippet end scheduledFunction
