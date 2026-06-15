import type { SecretService } from './secret-service.js'

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

  async getSecret<T = string>(key: string): Promise<T> {
    this.assertAllowed(key)
    return this.secrets.getSecret<T>(key)
  }

  async hasSecret(key: string): Promise<boolean> {
    this.assertAllowed(key)
    return this.secrets.hasSecret(key)
  }

  async setSecret(_key: string, _value: unknown): Promise<void> {
    throw new Error('setSecret is not allowed in scoped secret service')
  }

  async deleteSecret(_key: string): Promise<void> {
    throw new Error('deleteSecret is not allowed in scoped secret service')
  }

  async getSecrets<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(keys: (keyof T & string)[]): Promise<T> {
    const allowed = keys.filter((k) => this.allowedKeys.has(k))
    return this.secrets.getSecrets<T>(allowed as (keyof T & string)[])
  }
}
