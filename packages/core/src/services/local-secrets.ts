import { LocalVariablesService } from './local-variables.js'
import type { SecretService } from './secret-service.js'
import type { VariablesService } from './variables-service.js'

/**
 * Service for retrieving secrets from environment variables.
 * Supports storing secrets locally in memory for CLI operations.
 */
export class LocalSecretService implements SecretService {
  private localSecrets: Map<string, string> = new Map()

  private parseSecret<T>(raw: string): T {
    try {
      return JSON.parse(raw) as T
    } catch {
      return raw as unknown as T
    }
  }

  constructor(
    private variables: VariablesService = new LocalVariablesService()
  ) {}

  public async getSecret<T = string>(key: string): Promise<T> {
    const localValue = this.localSecrets.get(key)
    if (localValue) {
      return this.parseSecret<T>(localValue)
    }

    const value = await this.variables.get(key)
    if (value) {
      return this.parseSecret<T>(value)
    }
    throw new Error('Requested secret not found')
  }

  public async setSecret(key: string, value: unknown): Promise<void> {
    this.localSecrets.set(
      key,
      typeof value === 'string' ? value : JSON.stringify(value)
    )
  }

  public async hasSecret(key: string): Promise<boolean> {
    if (this.localSecrets.has(key)) {
      return true
    }
    const value = await this.variables.get(key)
    return value !== undefined && value !== null && value !== ''
  }

  public async deleteSecret(key: string): Promise<void> {
    this.localSecrets.delete(key)
  }
}
