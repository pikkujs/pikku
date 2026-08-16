import {
  createSecretValue,
  isSecretValue,
  type SecretValue,
} from '../classification/secret-value.js'
import { LocalVariablesService } from './local-variables.js'
import type { SecretService, SecretValues } from './secret-service.js'
import type { VariablesService } from './variables-service.js'

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

  public async getSecret<T = string>(key: string): Promise<SecretValue<T>> {
    const localValue = this.localSecrets.get(key)
    if (localValue) {
      return createSecretValue(this.parseSecret<T>(localValue))
    }

    const value = await this.variables.get(key)
    if (value) {
      return createSecretValue(this.parseSecret<T>(value))
    }
    throw new Error('Requested secret not found')
  }

  public async setSecret(key: string, value: unknown): Promise<void> {
    // Storing the wrapper would serialize it to '[secret]', so unwrap first —
    // writing a secret back to the vault is exactly what this method is for.
    const raw = isSecretValue(value) ? value.reveal() : value
    this.localSecrets.set(
      key,
      typeof raw === 'string' ? raw : JSON.stringify(raw)
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

  public async getSecrets<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(keys: (keyof T & string)[]): Promise<Partial<SecretValues<T>>> {
    const results = await Promise.allSettled(keys.map((k) => this.getSecret(k)))
    const out: Record<string, unknown> = {}
    keys.forEach((key, i) => {
      if (results[i].status === 'fulfilled')
        out[key] = (results[i] as PromiseFulfilledResult<unknown>).value
    })
    return out as Partial<SecretValues<T>>
  }
}
