import { wireScheduler } from '@pikku/core/scheduler'
import { nightly } from './functions.js'
import { pikkuSessionlessFunc } from './pikku.js'

wireScheduler({
  name: 'nightly',
  schedule: '0 0 * * *',
  func: nightly,
  summary: 'Nightly job',
  description: 'Runs at midnight',
  tags: ['jobs', 'cron'],
})

wireScheduler({
  name: 'inline-job',
  schedule: '*/5 * * * *',
  func: pikkuSessionlessFunc<void, void>(async () => {}),
})

wireScheduler({
  name: 'numeric',
  schedule: 60,
  func: nightly,
  tags: 'jobs' as any,
})

wireScheduler({
  name: 'off',
  schedule: '* * * * *',
  func: nightly,
  disabled: true,
})

// @ts-expect-error no func
wireScheduler({ name: 'no-func', schedule: '* * * * *' })

wireScheduler({ name: 'no-schedule', func: nightly })
