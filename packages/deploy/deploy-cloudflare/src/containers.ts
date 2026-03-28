import type { CloudflareClient } from './client.js'
import type { ContainerMetadata } from './types.js'

/**
 * Deploy a container to Cloudflare Containers (beta).
 *
 * This is the fallback deployment path for functions that are incompatible
 * with the Workers runtime (e.g. those requiring native dependencies or
 * long-running processes). Containers scale to zero when idle.
 *
 * @param client - Authenticated CloudflareClient instance.
 * @param name   - Container name.
 * @param image  - Container image reference (e.g. `ghcr.io/org/image:tag`).
 * @param env    - Environment variables to set on the container.
 * @returns Container metadata from the API.
 */
export async function deployContainer(
  client: CloudflareClient,
  name: string,
  image: string,
  env: Record<string, string> = {}
): Promise<ContainerMetadata> {
  return client.request<ContainerMetadata>('POST', '/containers', {
    name,
    image,
    environment_variables: env,
  })
}

/**
 * Delete a deployed container.
 *
 * @param client - Authenticated CloudflareClient instance.
 * @param name   - Container name to delete.
 */
export async function deleteContainer(
  client: CloudflareClient,
  name: string
): Promise<void> {
  await client.request<void>(
    'DELETE',
    `/containers/${encodeURIComponent(name)}`
  )
}

/**
 * List all containers in the account.
 *
 * @param client - Authenticated CloudflareClient instance.
 * @returns Array of container metadata objects.
 */
export async function listContainers(
  client: CloudflareClient
): Promise<ContainerMetadata[]> {
  return client.request<ContainerMetadata[]>('GET', '/containers')
}

/**
 * Get details of a specific container.
 *
 * @param client - Authenticated CloudflareClient instance.
 * @param name   - Container name.
 * @returns Container metadata, or `null` if the container does not exist.
 */
export async function getContainer(
  client: CloudflareClient,
  name: string
): Promise<ContainerMetadata | null> {
  try {
    return await client.request<ContainerMetadata>(
      'GET',
      `/containers/${encodeURIComponent(name)}`
    )
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return null
    }
    throw error
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: number }).status === 404
  )
}
