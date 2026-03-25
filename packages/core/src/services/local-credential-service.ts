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

  async getUsersWithCredential(name: string): Promise<string[]> {
    const suffix = `:${name}`
    const users: string[] = []
    for (const key of this.store.keys()) {
      if (key.endsWith(suffix)) {
        users.push(key.slice(0, -suffix.length))
      }
    }
    return users
  }

  async getAllUsers(): Promise<string[]> {
    const users = new Set<string>()
    for (const key of this.store.keys()) {
      const colonIndex = key.indexOf(':')
      if (colonIndex > 0) {
        users.add(key.slice(0, colonIndex))
      }
    }
    return [...users]
  }
}
