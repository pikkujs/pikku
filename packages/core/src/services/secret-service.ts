/**
 * Interface for retrieving and managing secrets.
 */
export interface SecretService {
  /**
   * Retrieves a secret by key and parses it as JSON.
   * @param key - The key of the secret to retrieve.
   * @returns A promise that resolves to the parsed secret value.
   * @throws If the secret is not found.
   */
  getSecretJSON<Return = {}>(key: string): Promise<Return>
  /**
   * Retrieves a secret by key as a string.
   * @param key - The key of the secret to retrieve.
   * @returns A promise that resolves to the secret value.
   * @throws If the secret is not found.
   */
  getSecret(key: string): Promise<string>
  /**
   * Checks if a secret exists without throwing.
   * @param key - The key of the secret to check.
   * @returns A promise that resolves to true if the secret exists, false otherwise.
   */
  hasSecret(key: string): Promise<boolean>
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
