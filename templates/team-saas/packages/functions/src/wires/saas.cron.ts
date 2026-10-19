import { wireScheduler } from '#pikku/scheduler'
import { expireInvitations } from '../functions/expire-invitations.function.js'

// @snippet start wireScheduler
wireScheduler({
  name: 'expireInvitations',
  // Hourly rather than nightly: a pending invitation is a standing offer of
  // access to a tenant, and the window between expiry and enforcement should
  // be short enough that "expired" means what it says.
  schedule: '0 * * * *',
  func: expireInvitations,
})
// @snippet end wireScheduler
