export class EmailService {
  constructor() {}

  async send(to: string, subject: string, body: string): Promise<void> {
    console.log(`[EmailService] Sending email to ${to}: ${subject}`)
  }
}
