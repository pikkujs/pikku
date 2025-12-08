import { wireHTTP } from '#pikku'
import {
  sendEmail,
  sendSMS,
  processPayment,
  saveData,
} from './internal.functions.js'
import { testExternal } from './external.functions.js'
import { logRequest, trackAnalytics, rateLimiter } from './middleware.js'
import {
  canSendEmail,
  canProcessPayment,
  hasEmailQuota,
} from './permissions.js'

// Notifications with middleware and permissions
wireHTTP({
  method: 'post',
  route: '/api/notifications/email',
  tags: ['notifications', 'email'],
  func: sendEmail,
  middleware: [logRequest],
  permissions: { allowed: [canSendEmail, hasEmailQuota(100)] },
})

wireHTTP({
  method: 'post',
  route: '/api/notifications/sms',
  tags: ['notifications', 'sms'],
  func: sendSMS,
  middleware: [logRequest],
})

// Payments with middleware and permissions
wireHTTP({
  method: 'post',
  route: '/api/payments/charge',
  tags: ['payments'],
  func: processPayment,
  middleware: [logRequest, trackAnalytics, rateLimiter(10)],
  permissions: { canProcessPayment },
})

// Storage
wireHTTP({
  method: 'post',
  route: '/api/storage/save',
  tags: ['storage'],
  func: saveData,
})

// External package test
wireHTTP({
  method: 'post',
  route: '/api/external/test',
  tags: ['external'],
  func: testExternal,
})
