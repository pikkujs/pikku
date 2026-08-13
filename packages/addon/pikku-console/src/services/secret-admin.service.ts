import type { SecretService } from '@pikku/core/services'

/**
 * Secret administration for the console.
 *
 * The secret id arrives as user input, so no static declaration can cover it —
 * administering arbitrary secrets is the job. Holding the `SecretService` here
 * keeps it out of the services a function receives, and makes the plaintext
 * disclosure a single greppable `.reveal()` rather than one per function.
 */
export class SecretAdminService {
  constructor(private secrets: SecretService) {}

  async has(secretId: string): Promise<boolean> {
    return this.secrets.hasSecret(secretId)
  }

  async read(secretId: string): Promise<{ exists: boolean; value: unknown }> {
    if (!(await this.secrets.hasSecret(secretId))) {
      return { exists: false, value: null }
    }
    const secret = await this.secrets.getSecret(secretId)
    return { exists: true, value: secret.reveal() }
  }

  async write(secretId: string, value: unknown): Promise<void> {
    await this.secrets.setSecret(secretId, value)
  }
}
