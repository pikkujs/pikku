export class SMSService {
  constructor() {}

  async send(to: string, message: string): Promise<void> {
    console.log(`[SMSService] Sending SMS to ${to}: ${message}`)
  }
}
