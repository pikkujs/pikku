export class PaymentService {
  constructor() {}

  async charge(amount: number, currency: string): Promise<string> {
    console.log(`[PaymentService] Charging ${amount} ${currency}`)
    return 'txn_' + Math.random().toString(36).substr(2, 9)
  }
}
