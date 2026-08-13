import type { CredentialService } from './credential-service.js'

/**
 * A `CredentialService` narrowed to the credentials a package declared.
 *
 * Unlike `ScopedSecretService` this stays writable — an addon refreshing its
 * own OAuth token is the normal case. What it cannot do is reach a credential
 * it never declared, or enumerate the app's users.
 */
export class ScopedCredentialService implements CredentialService {
  constructor(
    private credentials: CredentialService,
    private allowedNames: Set<string>
  ) {}

  private assertAllowed(name: string): void {
    if (!this.allowedNames.has(name)) {
      throw new Error(`Access denied to credential: ${name}`)
    }
  }

  async get<T = unknown>(name: string, userId?: string): Promise<T | null> {
    this.assertAllowed(name)
    return this.credentials.get<T>(name, userId)
  }

  async set(name: string, value: unknown, userId?: string): Promise<void> {
    this.assertAllowed(name)
    return this.credentials.set(name, value, userId)
  }

  async delete(name: string, userId?: string): Promise<void> {
    this.assertAllowed(name)
    return this.credentials.delete(name, userId)
  }

  async has(name: string, userId?: string): Promise<boolean> {
    this.assertAllowed(name)
    return this.credentials.has(name, userId)
  }

  async getAll(userId: string): Promise<Record<string, unknown>> {
    const all = await this.credentials.getAll(userId)
    const scoped: Record<string, unknown> = {}
    for (const name of this.allowedNames) {
      if (name in all) {
        scoped[name] = all[name]
      }
    }
    return scoped
  }

  async getUsersWithCredential(name: string): Promise<string[]> {
    this.assertAllowed(name)
    return this.credentials.getUsersWithCredential(name)
  }

  async getAllUsers(): Promise<string[]> {
    throw new Error(
      'Access denied: enumerating users is not allowed in a scoped credential service'
    )
  }
}
