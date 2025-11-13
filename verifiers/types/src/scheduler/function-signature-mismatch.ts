/**
 * Type constraint: Scheduler functions must have void input and output
 *
 * Scheduled tasks don't receive input parameters and don't return values,
 * so they must be typed as void -> void.
 */

import {
  wireScheduler,
  pikkuSessionlessFunc,
  pikkuFunc,
} from '../../.pikku/pikku-types.gen.js'

// Valid: Scheduler with void -> void function
wireScheduler({
  name: 'validTask',
  schedule: '*/5 * * * *',
  func: pikkuSessionlessFunc<void, void>(async ({ logger }, {}) => {
    logger.info('Task running')
  }),
})

wireScheduler({
  name: 'invalidInputTask',
  schedule: '*/5 * * * *',
  // @ts-expect-error - Scheduler function has input parameters (should be void)
  func: pikkuSessionlessFunc<{ count: number }, void>(async () => {}),
})

wireScheduler({
  name: 'invalidOutputTask',
  schedule: '*/5 * * * *',
  // @ts-expect-error - Scheduler function has return value (should be void)
  func: pikkuSessionlessFunc<void, { result: string }>(async () => ({
    result: 'done',
  })),
})

wireScheduler({
  name: 'invalidBothTask',
  schedule: '*/5 * * * *',
  // @ts-expect-error - Scheduler function has both input and output (should be void -> void)
  func: pikkuSessionlessFunc<{ id: number }, { status: string }>(async () => ({
    status: 'ok',
  })),
})

// Valid: Multiple valid schedulers
wireScheduler({
  name: 'dailyCleanup',
  schedule: '0 0 * * *',
  func: pikkuSessionlessFunc<void, void>(async ({ logger }, {}) => {
    logger.info('Daily cleanup')
  }),
})

wireScheduler({
  name: 'hourlySync',
  schedule: '0 * * * *',
  func: pikkuSessionlessFunc<void, void>(async () => {
    // Sync logic
  }),
})

// Valid: Scheduler with pikkuFunc (session-based)
wireScheduler({
  name: 'sessionTask',
  schedule: '*/10 * * * *',
  func: pikkuFunc<void, void>({
    func: async ({ logger }, {}) => {
      logger.info('Session-based task')
    },
  }),
})
