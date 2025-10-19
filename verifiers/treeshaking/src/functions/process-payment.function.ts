import { pikkuFunc } from '../../.pikku/pikku-types.gen.js'

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
