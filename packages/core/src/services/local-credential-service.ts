import type { CredentialService } from './credential-service.js'

export class LocalCredentialService implements CredentialService {
  private store: Map<string, unknown> = new Map()

  private makeKey(name: string, userId?: string): string {
    return userId ? `${userId}:${name}` : name
  }

  async get<T = unknown>(name: string, userId?: string): Promise<T | null> {
    const key = this.makeKey(name, userId)
    const value = this.store.get(key)
    return (value as T) ?? null
  }

  async set(name: string, value: unknown, userId?: string): Promise<void> {
    const key = this.makeKey(name, userId)
    this.store.set(key, value)
  }

  async delete(name: string, userId?: string): Promise<void> {
    const key = this.makeKey(name, userId)
    this.store.delete(key)
  }

  async has(name: string, userId?: string): Promise<boolean> {
    const key = this.makeKey(name, userId)
    return this.store.has(key)
  }

  async getAll(userId: string): Promise<Record<string, unknown>> {
    const prefix = `${userId}:`
    const result: Record<string, unknown> = {}
    for (const [key, value] of this.store) {
      if (key.startsWith(prefix)) {
        result[key.slice(prefix.length)] = value
      }
    }
    return result
  }
}
