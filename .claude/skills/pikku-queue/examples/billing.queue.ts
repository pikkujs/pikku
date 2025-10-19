import { wireQueueWorker } from './pikku-types.gen.js'
import {
  applyCharges,
  closeInvoice,
  sendInvoiceEmail,
} from './functions/billing.function.js'

/**
 * Multiple queue workers grouped in one file
 * All workers are for the same transport (queue)
 */

wireQueueWorker({
  queue: 'billing.charge',
  func: applyCharges,
})

wireQueueWorker({
  queue: 'billing.finalize',
  func: closeInvoice,
})

wireQueueWorker({
  queue: 'billing.notify',
  func: sendInvoiceEmail,
})
