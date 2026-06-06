import { execFileSync } from 'child_process'
import type { SecretService } from './secret-service.js'

/**
 * Service for retrieving secrets from gopass.
 * Requires gopass to be installed and configured on the system.
 */
export class GopassSecretService implements SecretService {
  constructor(private prefix: string = '') {}

  private getFullKey(key: string): string {
    if (!/^[\w.\-/]+$/.test(key)) {
      throw new Error(`Invalid secret key format: ${key}`)
    }
    return this.prefix ? `${this.prefix}${key}` : key
  }

  public async getSecret<T = string>(key: string): Promise<T> {
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
      return JSON.parse(raw) as T
    } catch {
      return raw as unknown as T
    }
  }

  public async hasSecret(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key)
    try {
      execFileSync('gopass', ['show', '-o', fullKey], { encoding: 'utf8' })
      return true
    } catch {
      return false
    }
  }

  public async setSecret(key: string, value: unknown): Promise<void> {
    const fullKey = this.getFullKey(key)
    const encoded = typeof value === 'string' ? value : JSON.stringify(value)
    try {
      execFileSync('gopass', ['insert', '-f', fullKey], {
        encoding: 'utf8',
        input: encoded,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (error: any) {
      throw new Error(`Failed to set secret: ${key}`, { cause: error })
    }
  }

  public async deleteSecret(key: string): Promise<void> {
    const fullKey = this.getFullKey(key)
    try {
      execFileSync('gopass', ['rm', '-f', fullKey], { encoding: 'utf8' })
    } catch {
      // Ignore errors if secret doesn't exist
    }
  }
}
