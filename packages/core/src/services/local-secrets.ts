import { LocalVariablesService } from './local-variables.js'
import { SecretService } from './secret-service.js'
import { VariablesService } from './variables-service.js'

/**
 * Service for retrieving secrets from environment variables.
 * Supports storing secrets locally in memory for CLI operations.
 */
export class LocalSecretService implements SecretService {
  private localSecrets: Map<string, string> = new Map()

  /**
   * Creates an instance of LocalSecretService.
   */
  constructor(
    private variables: VariablesService = new LocalVariablesService()
  ) {}

  /**
   * Retrieves a secret by key.
   * Checks local storage first, then falls back to environment variables.
   * @param key - The key of the secret to retrieve.
   * @returns A promise that resolves to the secret value.
   * @throws {Error} If the secret is not found.
   */
  public async getSecretJSON<R>(key: string): Promise<R> {
    // Check local storage first
    const localValue = this.localSecrets.get(key)
    if (localValue) {
      return JSON.parse(localValue)
    }

    // Fall back to environment variables
    const value = await this.variables.get(key)
    if (value) {
      return JSON.parse(value)
    }
    throw new Error(`Secret Not Found: ${key}`)
  }

  /**
   * Retrieves a secret by key.
   * Checks local storage first, then falls back to environment variables.
   * @param key - The key of the secret to retrieve.
   * @returns A promise that resolves to the secret value.
   * @throws {Error} If the secret is not found.
   */
  public async getSecret(key: string): Promise<string> {
    // Check local storage first
    const localValue = this.localSecrets.get(key)
    if (localValue) {
      return localValue
    }

    // Fall back to environment variables
    const value = await this.variables.get(key)
    if (value) {
      return value
    }
    throw new Error(`Secret Not Found: ${key}`)
  }

  /**
   * Stores a JSON value as a secret in local storage.
   * @param key - The key to store the secret under.
   * @param value - The JSON value to store.
   * @returns A promise that resolves when the secret is stored.
   */
  public async setSecretJSON(key: string, value: unknown): Promise<void> {
    this.localSecrets.set(key, JSON.stringify(value))
  }

  /**
   * Deletes a secret from local storage.
   * @param key - The key of the secret to delete.
   * @returns A promise that resolves when the secret is deleted.
   */
  public async deleteSecret(key: string): Promise<void> {
    this.localSecrets.delete(key)
  }
}
