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

export class TypedSecretService<TMap = Record<string, unknown>>
  implements SecretService
{
  constructor(
    private secrets: SecretService,
    private credentialsMeta: Record<string, CredentialMeta>
  ) {}

  async getSecretJSON<K extends keyof TMap & string>(key: K): Promise<TMap[K]>
  async getSecretJSON<T = unknown>(key: string): Promise<T>
  async getSecretJSON(key: string): Promise<unknown> {
    return this.secrets.getSecretJSON(key)
  }

  async getSecret(key: string): Promise<string> {
    return this.secrets.getSecret(key)
  }

  async hasSecret(key: string): Promise<boolean> {
    return this.secrets.hasSecret(key)
  }

  async setSecretJSON<K extends string>(
    key: K,
    value: K extends keyof TMap ? TMap[K] : unknown
  ): Promise<void> {
    return this.secrets.setSecretJSON(key, value)
  }

  async deleteSecret(key: string): Promise<void> {
    return this.secrets.deleteSecret(key)
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
