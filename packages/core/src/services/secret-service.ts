/**
 * Interface for retrieving and managing secrets.
 */
export interface SecretService {
  /**
   * Retrieves a secret by key.
   * @param key - The key of the secret to retrieve.
   * @returns A promise that resolves to the secret value.
   */
  getSecretJSON<Return = {}>(key: string): Promise<Return>
  /**
   * Retrieves a secret by key.
   * @param key - The key of the secret to retrieve.
   * @returns A promise that resolves to the secret value.
   */
  getSecret(key: string): Promise<string>
  /**
   * Stores a JSON value as a secret.
   * @param key - The key to store the secret under.
   * @param value - The JSON value to store.
   * @returns A promise that resolves when the secret is stored.
   */
  setSecretJSON(key: string, value: unknown): Promise<void>
  /**
   * Deletes a secret by key.
   * @param key - The key of the secret to delete.
   * @returns A promise that resolves when the secret is deleted.
   */
  deleteSecret(key: string): Promise<void>
}
