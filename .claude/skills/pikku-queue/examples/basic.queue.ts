import { wireQueueWorker } from './pikku-types.gen.js'
import { sendEmail } from './functions/email-worker.function.js'

/**
 * Basic queue worker wiring
 * The sendEmail function is defined in ./functions/email-worker.function.ts
 */
wireQueueWorker({
  queue: 'email',
  func: sendEmail,
})
