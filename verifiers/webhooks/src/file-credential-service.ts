import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { CredentialService } from '@pikku/core/services'

/**
 * Credentials kept in a file, so what a `pikku webhooks setup` run stores in
 * its own process is what this one's `receive` reads on the next delivery.
 */
export class FileCredentialService implements CredentialService {
  constructor(private readonly path: string | undefined) {}

  private file(): string {
    if (!this.path) throw new Error('CREDENTIALS_FILE is not set')
    return this.path
  }

  private read(): Record<string, unknown> {
    return existsSync(this.file())
      ? JSON.parse(readFileSync(this.file(), 'utf-8'))
      : {}
  }

  private write(store: Record<string, unknown>): void {
    writeFileSync(this.file(), JSON.stringify(store, null, 2))
  }

  private key(name: string, userId?: string): string {
    return userId ? `${userId}:${name}` : name
  }

  async get<T = unknown>(name: string, userId?: string): Promise<T | null> {
    return (this.read()[this.key(name, userId)] as T) ?? null
  }

  async set(name: string, value: unknown, userId?: string): Promise<void> {
    this.write({ ...this.read(), [this.key(name, userId)]: value })
  }

  async delete(name: string, userId?: string): Promise<void> {
    const { [this.key(name, userId)]: _removed, ...rest } = this.read()
    this.write(rest)
  }

  async has(name: string, userId?: string): Promise<boolean> {
    return this.key(name, userId) in this.read()
  }

  async getAll(userId: string): Promise<Record<string, unknown>> {
    const prefix = `${userId}:`
    return Object.fromEntries(
      Object.entries(this.read())
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [key.slice(prefix.length), value])
    )
  }

  async getUsersWithCredential(name: string): Promise<string[]> {
    const suffix = `:${name}`
    return Object.keys(this.read())
      .filter((key) => key.endsWith(suffix))
      .map((key) => key.slice(0, -suffix.length))
  }

  async getAllUsers(): Promise<string[]> {
    return [
      ...new Set(
        Object.keys(this.read())
          .filter((key) => key.includes(':'))
          .map((key) => key.slice(0, key.indexOf(':')))
      ),
    ]
  }
}
