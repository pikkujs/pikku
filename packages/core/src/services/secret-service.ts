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
}
