import { createHmac } from 'node:crypto'

export class HmacSignerService {
  constructor(private secretKey: string) {}

  sign(message: string): string {
    return createHmac('sha256', this.secretKey).update(message).digest('hex')
  }

  verify(message: string, signature: string): boolean {
    const expected = this.sign(message)
    return expected === signature
  }
}
