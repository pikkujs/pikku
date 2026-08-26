import type { SecretValue } from '../classification/secret-value.js'
import type { SecretService, SecretValues } from './secret-service.js'

/**
 * The wrapper, or `undefined` when the generated map declares the key as an
 * optional property. The `undefined` has to be lifted OUT of `SecretValue` —
 * a missing optional secret resolves to `undefined` itself, not to a wrapper
 * around it, so `SecretValue<T | undefined>` would type a value that never
 * exists and hide the `undefined` behind a `.reveal()` the caller never reaches.
 */
export type SecretResult<T> = undefined extends T
  ? SecretValue<Exclude<T, undefined>> | undefined
  : SecretValue<T>

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
  /**
   * Declared `optional: true`, so absence is a supported state rather than a
   * misconfiguration. The generated map types the key as an optional property,
   * which is what puts `undefined` in `getSecret`'s return type.
   */
  optional?: boolean
  oauth2?: { tokenSecretId: string }
}

export class TypedSecretService<
  TMap = Record<string, unknown>,
> implements SecretService {
  // knowledge: decisions/internals/typed-secret-service-caches-for-the-process-lifetime.md
  private cache = new Map<string, unknown>()

  constructor(
    private secrets: SecretService,
    private credentialsMeta: Record<string, CredentialMeta>
  ) {}

  async getSecret<K extends keyof TMap & string>(
    key: K
  ): Promise<SecretResult<TMap[K]>>
  async getSecret<T = string>(key: string): Promise<SecretValue<T>>
  async getSecret(key: string): Promise<unknown> {
    if (this.cache.has(key)) {
      return this.cache.get(key)
    }
    if (
      this.credentialsMeta[key]?.optional &&
      !(await this.secrets.hasSecret(key))
    ) {
      this.cache.set(key, undefined)
      return undefined
    }
    const value = await this.secrets.getSecret(key)
    this.cache.set(key, value)
    return value
  }

  async hasSecret(key: string): Promise<boolean> {
    // `undefined` is cached for an optional secret that resolved absent, so a
    // cache hit means "already looked", not "there is a value". Reporting true
    // for it would let a read of an optional secret assert its own presence.
    if (this.cache.has(key)) {
      return this.cache.get(key) !== undefined
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
  ): Promise<Partial<SecretValues<T>>> {
    const result: Partial<SecretValues<T>> = {}
    const missing: (keyof T & string)[] = []
    for (const key of keys) {
      if (this.cache.has(key)) {
        result[key] = this.cache.get(key) as SecretValues<T>[keyof T & string]
      } else {
        missing.push(key)
      }
    }
    if (missing.length > 0) {
      const fetched = await this.secrets.getSecrets<T>(missing)
      for (const [key, value] of Object.entries(fetched)) {
        this.cache.set(key, value)
        result[key as keyof T & string] = value as SecretValues<T>[keyof T &
          string]
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
