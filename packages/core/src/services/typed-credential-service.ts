import type { CredentialService } from './credential-service.js'

export interface CredentialStatusInfo {
  name: string
  displayName: string
  isConfigured: boolean
  type: 'singleton' | 'wire'
  oauth2?: boolean
}

export type CredentialMetaInfo = {
  name: string
  displayName: string
  type: 'singleton' | 'wire'
  oauth2?: boolean
}

export class TypedCredentialService<TMap = Record<string, unknown>>
  implements CredentialService
{
  constructor(
    private credentials: CredentialService,
    private credentialsMeta: Record<string, CredentialMetaInfo>
  ) {}

  async get<K extends keyof TMap & string>(
    name: K,
    userId?: string
  ): Promise<TMap[K] | null>
  async get<T = unknown>(name: string, userId?: string): Promise<T | null>
  async get(name: string, userId?: string): Promise<unknown> {
    return this.credentials.get(name, userId)
  }

  async set<K extends string>(
    name: K,
    value: K extends keyof TMap ? TMap[K] : unknown,
    userId?: string
  ): Promise<void> {
    return this.credentials.set(name, value, userId)
  }

  async delete(name: string, userId?: string): Promise<void> {
    return this.credentials.delete(name, userId)
  }

  async has(name: string, userId?: string): Promise<boolean> {
    return this.credentials.has(name, userId)
  }

  async getAll(userId: string): Promise<Record<string, unknown>> {
    return this.credentials.getAll(userId)
  }

  async getAllStatus(userId?: string): Promise<CredentialStatusInfo[]> {
    const results: CredentialStatusInfo[] = []

    for (const [name, meta] of Object.entries(this.credentialsMeta)) {
      results.push({
        name,
        displayName: meta.displayName,
        isConfigured: await this.credentials.has(name, userId),
        type: meta.type,
        oauth2: meta.oauth2,
      })
    }

    return results
  }

  async getMissing(userId?: string): Promise<CredentialStatusInfo[]> {
    const all = await this.getAllStatus(userId)
    return all.filter((c) => !c.isConfigured)
  }
}
