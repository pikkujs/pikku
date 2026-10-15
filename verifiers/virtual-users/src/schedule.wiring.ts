import { wireScheduler } from '#pikku/scheduler'
import {
  tickVirtualUserSchedules,
  virtualUserPlatformSession,
} from './scaffold/virtual-user/virtual-user.gen.js'

/** The wiring a project writes when it means to run virtual users unattended. */
wireScheduler({
  name: 'virtualUsers',
  schedule: '0 * * * *',
  middleware: [virtualUserPlatformSession],
  func: tickVirtualUserSchedules,
})

/** The same tick without the platform session, to prove the scope gate bites. */
wireScheduler({
  name: 'virtualUsersWithoutSession',
  schedule: '0 * * * *',
  func: tickVirtualUserSchedules,
})
