import { execFileSync } from 'child_process'
import type { SecretService } from './secret-service.js'

/**
 * Service for retrieving secrets from gopass.
 * Requires gopass to be installed and configured on the system.
 */
export class GopassSecretService implements SecretService {
  /**
   * Creates an instance of GopassSecretService.
   * @param prefix - Optional prefix for all secret keys (e.g., 'pikku/' will look up 'pikku/mykey' for key 'mykey')
   */
  constructor(private prefix: string = '') {}

  private getFullKey(key: string): string {
    if (!/^[\w.\-/]+$/.test(key)) {
      throw new Error(`Invalid secret key format: ${key}`)
    }
    return this.prefix ? `${this.prefix}${key}` : key
  }

  /**
   * Retrieves a secret by key as a string.
   * @param key - The key of the secret to retrieve.
   * @returns A promise that resolves to the secret value.
   * @throws {Error} If the secret is not found or gopass fails.
   */
  public async getSecret<R = unknown>(key: string): Promise<R> {
    const fullKey = this.getFullKey(key)
    let raw: string
    try {
      raw = execFileSync('gopass', ['show', '-o', fullKey], {
        encoding: 'utf8',
      }).trim()
    } catch (error: any) {
      throw new Error(`Secret Not Found: ${key}`, { cause: error })
    }
    try {
      return JSON.parse(raw) as R
    } catch {
      return raw as unknown as R
    }
  }

  /**
   * Checks if a secret exists without throwing.
   * @param key - The key of the secret to check.
   * @returns A promise that resolves to true if the secret exists.
   */
  public async hasSecret(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key)
    try {
      execFileSync('gopass', ['show', '-o', fullKey], { encoding: 'utf8' })
      return true
    } catch {
      return false
    }
  }

  /**
   * Stores a value as a JSON-encoded secret in gopass.
   * @param key - The key to store the secret under.
   * @param value - The value to store.
   * @returns A promise that resolves when the secret is stored.
   */
  public async setSecret(key: string, value: unknown): Promise<void> {
    const fullKey = this.getFullKey(key)
    const jsonValue = JSON.stringify(value)
    try {
      execFileSync('gopass', ['insert', '-f', fullKey], {
        encoding: 'utf8',
        input: jsonValue,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (error: any) {
      throw new Error(`Failed to set secret: ${key}`, { cause: error })
    }
  }

  /**
   * Deletes a secret from gopass.
   * @param key - The key of the secret to delete.
   * @returns A promise that resolves when the secret is deleted.
   */
  public async deleteSecret(key: string): Promise<void> {
    const fullKey = this.getFullKey(key)
    try {
      execFileSync('gopass', ['rm', '-f', fullKey], { encoding: 'utf8' })
    } catch {
      // Ignore errors if secret doesn't exist
    }
  }
}
