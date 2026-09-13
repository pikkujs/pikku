import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/function'

/**
 * The availability gate on a function that also carries a scope gate.
 *
 * Both run, in that order, which is what the suite checks: an unscoped caller
 * is refused with a 403 whether or not the feature is up, so nobody learns
 * from a refusal that a dark feature exists.
 */
export const viewQuarterlyReport = pikkuFunc<void, { report: string }>({
  expose: true,
  scopes: ['reports:read'],
  featureFlag: 'quarterlyReports',
  func: async ({ analytics }) => {
    await analytics?.record({
      name: 'report_viewed',
      report: 'quarterly',
    })
    return { report: 'quarterly numbers' }
  },
})

/**
 * A kill switch on a path with no session behind it.
 *
 * `bulkExport` declares no `anyOf`, so capability never enters into it and the
 * switch is the whole answer — the shape a cron task or a queue worker is
 * gated by, where there is no UI for anyone to notice the feature is off.
 */
export const runBulkExport = pikkuSessionlessFunc<void, { rows: number }>({
  expose: true,
  featureFlag: 'bulkExport',
  func: async () => ({ rows: 3 }),
})

/**
 * Gated by a flag nobody has ever switched on.
 *
 * A synced flag starts off, and the seed switches on the other two and leaves
 * this one alone — so this is the one function here that is refused with a 503
 * out of the box, without anybody having killed anything.
 */
export const openDarkLaunch = pikkuSessionlessFunc<void, { open: true }>({
  expose: true,
  featureFlag: 'darkLaunch',
  func: async () => ({ open: true }),
})
