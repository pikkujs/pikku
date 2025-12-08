import { pikkuFunc } from '#pikku'

export const sendEmail = pikkuFunc<
  { to: string; subject: string; body: string },
  void
>({
  func: async ({ email, userContext }, data) => {
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
  func: async ({ payment, analytics, userPreferences }, data) => {
    const transactionId = await payment.charge(data.amount, data.currency)
    await analytics.track('payment_processed', {
      amount: data.amount,
      currency: data.currency,
    })
    return { transactionId }
  },
})

export const saveData = pikkuFunc<{ key: string; value: any }, void>({
  func: async ({ storage, userContext, userPreferences }, data) => {
    await storage.save(data.key, data.value)
  },
})
