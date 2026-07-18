import type { SecretService } from './secret-service.js'

export interface CredentialStatus {
  secretId: string
  name: string
  displayName: string
  isConfigured: boolean
  oauth2?: { tokenSecretId: string }
}

export type CredentialMeta = {
  name: string
  displayName: string
  oauth2?: { tokenSecretId: string }
}

export class TypedSecretService<
  TMap = Record<string, unknown>,
> implements SecretService {
  /**
   * In-process cache of resolved secrets, so callers can read naively without
   * re-hitting the underlying service on every call. Only successful reads are
   * cached (a miss throws and isn't stored); `setSecret`/`deleteSecret`
   * invalidate the key. No TTL — a secret rotated out-of-band won't refresh
   * until restart (see pikkujs/pikku#964).
   */
  private cache = new Map<string, unknown>()

  constructor(
    private secrets: SecretService,
    private credentialsMeta: Record<string, CredentialMeta>
  ) {}

  async getSecret<K extends keyof TMap & string>(key: K): Promise<TMap[K]>
  async getSecret<T = string>(key: string): Promise<T>
  async getSecret(key: string): Promise<unknown> {
    if (this.cache.has(key)) {
      return this.cache.get(key)
    }
    const value = await this.secrets.getSecret(key)
    this.cache.set(key, value)
    return value
  }

  async hasSecret(key: string): Promise<boolean> {
    if (this.cache.has(key)) {
      return true
    }
    return this.secrets.hasSecret(key)
  }

  async setSecret<K extends string>(
    key: K,
    value: K extends keyof TMap ? TMap[K] : unknown
  ): Promise<void> {
    await this.secrets.setSecret(key, value)
    this.cache.delete(key)
  }

  async deleteSecret(key: string): Promise<void> {
    await this.secrets.deleteSecret(key)
    this.cache.delete(key)
  }

  async getSecrets<T extends Record<string, unknown> = Record<string, unknown>>(
    keys: (keyof T & string)[]
  ): Promise<Partial<T>> {
    const result: Partial<T> = {}
    const missing: (keyof T & string)[] = []
    for (const key of keys) {
      if (this.cache.has(key)) {
        result[key] = this.cache.get(key) as T[keyof T & string]
      } else {
        missing.push(key)
      }
    }
    if (missing.length > 0) {
      const fetched = await this.secrets.getSecrets<T>(missing)
      for (const [key, value] of Object.entries(fetched)) {
        this.cache.set(key, value)
        result[key as keyof T & string] = value as T[keyof T & string]
      }
    }
    return result
  }

  async getAllStatus(): Promise<CredentialStatus[]> {
    const results: CredentialStatus[] = []

    for (const [secretId, meta] of Object.entries(this.credentialsMeta)) {
      results.push({
        secretId,
        name: meta.name,
        displayName: meta.displayName,
        isConfigured: await this.secrets.hasSecret(secretId),
        oauth2: meta.oauth2,
      })
    }

    return results
  }

  async getMissing(): Promise<CredentialStatus[]> {
    const all = await this.getAllStatus()
    return all.filter((c) => !c.isConfigured)
  }
}
