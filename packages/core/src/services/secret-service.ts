/**
 * Interface for retrieving and managing secrets.
 */
export interface SecretService {
  /**
   * Retrieves a secret by key, typed as T (defaults to string).
   * @param key - The key of the secret to retrieve.
   * @returns A promise that resolves to the secret value.
   * @throws If the secret is not found.
   */
  getSecret<T = string>(key: string): Promise<T>
  /**
   * Checks if a secret exists without throwing.
   * @param key - The key of the secret to check.
   * @returns A promise that resolves to true if the secret exists, false otherwise.
   */
  hasSecret(key: string): Promise<boolean>
  /**
   * Stores a secret value.
   * @param key - The key to store the secret under.
   * @param value - The value to store.
   * @returns A promise that resolves when the secret is stored.
   */
  setSecret(key: string, value: unknown): Promise<void>
  /**
   * Deletes a secret by key.
   * @param key - The key of the secret to delete.
   * @returns A promise that resolves when the secret is deleted.
   */
  deleteSecret(key: string): Promise<void>
  /**
   * Retrieves multiple secrets in a single batch operation.
   * Returns a map of key → value for successfully fetched secrets; missing
   * keys are omitted rather than throwing, so the result is typed as
   * `Partial<T>` and callers must handle keys that may be absent at runtime.
   *
   * Pass a shape as `T` to get a typed result without casting, e.g.
   * `await secrets.getSecrets<{ FOO: string; BAR: { id: string } }>(['FOO', 'BAR'])`.
   * @param keys - The keys of the secrets to retrieve.
   */
  getSecrets<T extends Record<string, unknown> = Record<string, unknown>>(
    keys: (keyof T & string)[]
  ): Promise<Partial<T>>
}
