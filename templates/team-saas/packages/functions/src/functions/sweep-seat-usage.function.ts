import { pikkuVoidFunc } from '#pikku/function'

/**
 * One pass over the organisations that need attention, firing the handler for each.
 *
 * This was a `setInterval` inside a trigger source — the scheduler reimplemented
 * badly. It could not be invoked once, so nothing tested it, an operator could
 * not force it, and calling it would have leaked a timer per call.
 *
 * It has two callers with two different rights, and the difference is tenancy.
 * The schedule runs with no session: it is the platform, and it sweeps every
 * organisation. A person forcing a pass from the operations screen is not the
 * platform, so the same pass narrows to the organisations they belong to. Left
 * unscoped, exposing the sweep would have handed any signed-in member a seat
 * census of every customer on the box — the one read this template exists to
 * demonstrate never happening.
 */
export const sweepSeatUsage = pikkuVoidFunc({
  // Exposed so an operator can force a pass and a scenario can prove it works.
  expose: true,
  func: async ({ kysely, logger }, _data, { rpc, session }) => {
    const scopedTo = session
      ? (
          await kysely
            .selectFrom('membership')
            .select('orgId')
            .where('userId', '=', session.userId)
            .execute()
        ).map(({ orgId }) => orgId)
      : null

    // A member of nothing sweeps nothing. Worth its own branch rather than
    // falling through: `where orgId in ()` is a syntax error, not an empty set.
    if (scopedTo?.length === 0) {
      logger.info({ event: 'seat_usage_swept', noticed: 0, scoped: true })
      return
    }

    const rows = await kysely
      .selectFrom('organisation')
      .innerJoin('membership', 'membership.orgId', 'organisation.orgId')
      .select(({ fn }) => [
        'organisation.orgId',
        'organisation.seats',
        fn.count<number>('membership.membershipId').as('members'),
      ])
      .$if(scopedTo !== null, (qb) =>
        qb.where('organisation.orgId', 'in', scopedTo!)
      )
      .groupBy(['organisation.orgId', 'organisation.seats'])
      .execute()

    for (const row of rows) {
      await rpc.invoke('onSeatsExceeded', { orgId: row.orgId, seats: row.seats, members: Number(row.members) })
    }

    logger.info({
      event: 'seat_usage_swept',
      noticed: rows.length,
      scoped: scopedTo !== null,
    })
  },
})
