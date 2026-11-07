import type { CredentialService } from '@pikku/core/services'
import {
  createScriptContent,
  getText,
  hasKey,
  putText,
} from './script-content.js'

/**
 * Credentials kept in a file, so what a `pikku webhooks setup` run stores in
 * its own process is what this one's `receive` reads on the next delivery.
 */
export class FileCredentialService implements CredentialService {
  constructor(private readonly dir: string | undefined) {}

  private content() {
    if (!this.dir) throw new Error('WEBHOOK_SCRATCH_DIR is not set')
    return createScriptContent(this.dir)
  }

  private async read(): Promise<Record<string, unknown>> {
    const content = this.content()
    return (await hasKey(content, 'credentials', 'credentials.json'))
      ? JSON.parse(await getText(content, 'credentials', 'credentials.json'))
      : {}
  }

  private async write(store: Record<string, unknown>): Promise<void> {
    await putText(
      this.content(),
      'credentials',
      'credentials.json',
      JSON.stringify(store, null, 2)
    )
  }

  private key(name: string, userId?: string): string {
    return userId ? `${userId}:${name}` : name
  }

  async get<T = unknown>(name: string, userId?: string): Promise<T | null> {
    return ((await this.read())[this.key(name, userId)] as T) ?? null
  }

  async set(name: string, value: unknown, userId?: string): Promise<void> {
    await this.write({
      ...(await this.read()),
      [this.key(name, userId)]: value,
    })
  }

  async delete(name: string, userId?: string): Promise<void> {
    const { [this.key(name, userId)]: _removed, ...rest } = await this.read()
    await this.write(rest)
  }

  async has(name: string, userId?: string): Promise<boolean> {
    return this.key(name, userId) in (await this.read())
  }

  async getAll(userId: string): Promise<Record<string, unknown>> {
    const prefix = `${userId}:`
    return Object.fromEntries(
      Object.entries(await this.read())
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [key.slice(prefix.length), value])
    )
  }

  async getUsersWithCredential(name: string): Promise<string[]> {
    const suffix = `:${name}`
    return Object.keys(await this.read())
      .filter((key) => key.endsWith(suffix))
      .map((key) => key.slice(0, -suffix.length))
  }

  async getAllUsers(): Promise<string[]> {
    return [
      ...new Set(
        Object.keys(await this.read())
          .filter((key) => key.includes(':'))
          .map((key) => key.slice(0, key.indexOf(':')))
      ),
    ]
  }
}
