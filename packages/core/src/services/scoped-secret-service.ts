import { SecretService } from './secret-service.js'

/**
 * A read-only wrapper around SecretService that restricts access
 * to only a defined set of allowed secret keys.
 */
export class ScopedSecretService implements SecretService {
  constructor(
    private secrets: SecretService,
    private allowedKeys: Set<string>
  ) {}

  private assertAllowed(key: string): void {
    if (!this.allowedKeys.has(key)) {
      throw new Error(`Access denied to secret key: ${key}`)
    }
  }

  async getSecret(key: string): Promise<string> {
    this.assertAllowed(key)
    return this.secrets.getSecret(key)
  }

  async getSecretJSON<T = {}>(key: string): Promise<T> {
    this.assertAllowed(key)
    return this.secrets.getSecretJSON<T>(key)
  }
}
