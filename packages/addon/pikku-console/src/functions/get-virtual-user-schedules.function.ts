import { pikkuFunc } from '#pikku/addon/function'

/**
 * Which personas are on a clock, and when each is next due.
 *
 * Read off the host's own `virtualUserScheduleStore` rather than through the
 * scaffolded RPC, so a project that wired the store sees its cadences whether
 * or not it turned `scaffold.virtualUser` on — the same reasoning as
 * `getVirtualUserRuns`, and the reason both are readable while neither can be
 * changed from here without the scaffold.
 *
 * Returns rows and nothing else. What each persona *declares* is already in the
 * meta the console loads, so pairing the two is the client's to do — sending a
 * second copy of the declarations down here would only give it two answers that
 * can disagree.
 */
export const getVirtualUserSchedules = pikkuFunc<void, any[]>({
  title: 'Get Virtual User Schedules',
  description:
    'Returns the recorded virtual user cadences: which personas are enabled, how often they run, and when each is next due.',
  expose: true,
  scopes: ['pikku:console:virtualUsers:read'],
  func: async ({ virtualUserScheduleStore }) => {
    if (!virtualUserScheduleStore) {
      return []
    }
    const schedules = await virtualUserScheduleStore.list()
    return schedules.map((schedule) => ({
      ...schedule,
      nextRunAt: schedule.nextRunAt.toISOString(),
      lastRunAt: schedule.lastRunAt ? schedule.lastRunAt.toISOString() : null,
    }))
  },
})
