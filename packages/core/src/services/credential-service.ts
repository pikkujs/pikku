/**
 * Interface for managing dynamic/managed credentials.
 * Used for OAuth tokens, per-user API keys, and other credentials
 * that change at runtime (as opposed to SecretService which is for
 * static, developer-configured values).
 */
export interface CredentialService {
  /**
   * Retrieves a credential by name and optional user ID.
   * @param name - The credential name (e.g. 'stripe', 'google-sheets').
   * @param userId - Optional user ID for per-user credentials. Omit for platform-level.
   * @returns The credential value, or null if not found.
   */
  get<T = unknown>(name: string, userId?: string): Promise<T | null>

  /**
   * Stores a credential.
   * @param name - The credential name.
   * @param value - The credential value to store.
   * @param userId - Optional user ID for per-user credentials. Omit for platform-level.
   */
  set(name: string, value: unknown, userId?: string): Promise<void>

  /**
   * Deletes a credential.
   * @param name - The credential name.
   * @param userId - Optional user ID for per-user credentials. Omit for platform-level.
   */
  delete(name: string, userId?: string): Promise<void>

  /**
   * Checks if a credential exists.
   * @param name - The credential name.
   * @param userId - Optional user ID for per-user credentials. Omit for platform-level.
   */
  has(name: string, userId?: string): Promise<boolean>

  /**
   * Retrieves all credentials for a user.
   * @param userId - The user ID.
   * @returns A record of credential name to value.
   */
  getAll(userId: string): Promise<Record<string, unknown>>
}
