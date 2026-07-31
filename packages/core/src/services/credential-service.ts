/**
 * Dynamic credentials — OAuth tokens, per-user API keys — that change at
 * runtime, as opposed to `SecretService`'s static developer-configured values.
 * Throughout, an omitted `userId` means the platform-level credential.
 */
export interface CredentialService {
  get<T = unknown>(name: string, userId?: string): Promise<T | null>

  set(name: string, value: unknown, userId?: string): Promise<void>

  delete(name: string, userId?: string): Promise<void>

  has(name: string, userId?: string): Promise<boolean>

  getAll(userId: string): Promise<Record<string, unknown>>

  getUsersWithCredential(name: string): Promise<string[]>

  getAllUsers(): Promise<string[]>
}
