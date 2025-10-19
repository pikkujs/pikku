import {
  wireHTTP,
  pikkuFunc,
  pikkuMiddleware,
  pikkuPermission,
  pikkuMiddlewareFactory,
  pikkuPermissionFactory,
} from '../../.pikku/pikku-types.gen.js'

// ============================================================================
// FUNCTIONS
// ============================================================================

export const sendEmail = pikkuFunc<
  { to: string; subject: string; body: string },
  void
>({
  func: async ({ email }, data) => {
    await email.send(data.to, data.subject, data.body)
  },
})

export const sendSMS = pikkuFunc<{ to: string; message: string }, void>({
  func: async ({ sms }, data) => {
    await sms.send(data.to, data.message)
  },
})

export const processPayment = pikkuFunc<
  { amount: number; currency: string },
  { transactionId: string }
>({
  func: async ({ payment, analytics }, data) => {
    const transactionId = await payment.charge(data.amount, data.currency)
    await analytics.track('payment_processed', {
      amount: data.amount,
      currency: data.currency,
    })
    return { transactionId }
  },
})

export const saveData = pikkuFunc<{ key: string; value: any }, void>({
  func: async ({ storage }, data) => {
    await storage.save(data.key, data.value)
  },
})

// ============================================================================
// MIDDLEWARE
// ============================================================================

export const logRequest = pikkuMiddleware({
  func: async ({ logger }, _data, _userSession) => {
    logger.log('Request logged')
  },
})

export const trackAnalytics = pikkuMiddleware({
  func: async ({ analytics }, _data, _userSession) => {
    await analytics.track('request_received', {})
  },
})

// ============================================================================
// PERMISSIONS
// ============================================================================

export const canSendEmail = pikkuPermission({
  func: async ({ email }, _data, _userSession) => {
    // Check email quota or something
    return true
  },
})

export const canProcessPayment = pikkuPermission({
  func: async ({ payment }, _data, _userSession) => {
    // Check payment limits
    return true
  },
})

// ============================================================================
// MIDDLEWARE FACTORIES
// ============================================================================

export const rateLimiter = pikkuMiddlewareFactory((limit: number) => ({
  func: async ({ storage }, _data, _userSession) => {
    // Use storage to track rate limits
    await storage.save('rate_limit', limit)
  },
}))

// ============================================================================
// PERMISSION FACTORIES
// ============================================================================

export const hasEmailQuota = pikkuPermissionFactory((quota: number) => ({
  func: async ({ email }, _data, _userSession) => {
    // Check email quota
    return true
  },
}))

// ============================================================================
// HTTP WIRINGS
// ============================================================================

// Notifications with middleware and permissions
wireHTTP({
  method: 'post',
  route: '/api/notifications/email',
  tags: ['notifications', 'email'],
  func: sendEmail,
  middleware: [logRequest],
  permissions: [canSendEmail, hasEmailQuota(100)],
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
  permissions: [canProcessPayment],
})

// Storage
wireHTTP({
  method: 'post',
  route: '/api/storage/save',
  tags: ['storage'],
  func: saveData,
})
