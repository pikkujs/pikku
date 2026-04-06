import type { CloudflareClient } from './client.js'
import type { WorkerSecretEntry } from './types.js'

/**
 * Set a secret on a Worker.
 *
 * If the secret already exists, it will be overwritten. The value is
 * encrypted at rest by Cloudflare and is never returned by any API call.
 *
 * @param client     - Authenticated CloudflareClient instance.
 * @param workerName - The Worker script name to set the secret on.
 * @param key        - Secret name (environment variable name in the Worker).
 * @param value      - Secret value (plaintext; encrypted by CF on storage).
 */
export async function setSecret(
  client: CloudflareClient,
  workerName: string,
  key: string,
  value: string
): Promise<void> {
  await client.request<unknown>(
    'PUT',
    `/workers/scripts/${encodeURIComponent(workerName)}/secrets`,
    { name: key, text: value, type: 'secret_text' }
  )
}

/**
 * Delete a secret from a Worker.
 *
 * @param client     - Authenticated CloudflareClient instance.
 * @param workerName - The Worker script name.
 * @param key        - Secret name to delete.
 */
export async function deleteSecret(
  client: CloudflareClient,
  workerName: string,
  key: string
): Promise<void> {
  await client.request<void>(
    'DELETE',
    `/workers/scripts/${encodeURIComponent(workerName)}/secrets/${encodeURIComponent(key)}`
  )
}

/**
 * List all secrets set on a Worker.
 *
 * Only secret names and types are returned — values are never exposed.
 *
 * @param client     - Authenticated CloudflareClient instance.
 * @param workerName - The Worker script name.
 * @returns Array of secret entries (name and type only).
 */
export async function listSecrets(
  client: CloudflareClient,
  workerName: string
): Promise<WorkerSecretEntry[]> {
  return client.request<WorkerSecretEntry[]>(
    'GET',
    `/workers/scripts/${encodeURIComponent(workerName)}/secrets`
  )
}
