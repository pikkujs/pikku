import type { CloudflareClient } from './client.js'
import type { WorkerBinding, WorkerMetadata, WorkerRoute } from './types.js'

/**
 * Create (upload) a new Worker script with optional bindings and routes.
 *
 * Uses the multipart form upload API so that bindings metadata can be
 * attached alongside the script content in a single request.
 *
 * @param client   - Authenticated CloudflareClient instance.
 * @param name     - Worker script name (unique within the account).
 * @param script   - The JavaScript/TypeScript bundle content.
 * @param bindings - Resource bindings (D1, R2, Queue, Service, etc.).
 * @param routes   - Optional route patterns to attach to the Worker.
 * @returns Worker metadata from the API.
 */
export async function createWorker(
  client: CloudflareClient,
  name: string,
  script: string,
  bindings: WorkerBinding[] = [],
  routes: WorkerRoute[] = [],
  compatibilityDate?: string
): Promise<WorkerMetadata> {
  const metadata = buildWorkerMetadataPayload(bindings, compatibilityDate)
  const result = await uploadWorkerScript(client, name, script, metadata)

  if (routes.length > 0) {
    await setWorkerRoutes(client, name, routes)
  }

  return result
}

/**
 * Update an existing Worker script and its bindings.
 *
 * This is functionally identical to create — the CF API uses PUT which
 * acts as an upsert. Separated for semantic clarity in calling code.
 *
 * @param client   - Authenticated CloudflareClient instance.
 * @param name     - Worker script name.
 * @param script   - Updated bundle content.
 * @param bindings - Updated resource bindings.
 * @returns Worker metadata from the API.
 */
export async function updateWorker(
  client: CloudflareClient,
  name: string,
  script: string,
  bindings: WorkerBinding[] = [],
  compatibilityDate?: string
): Promise<WorkerMetadata> {
  const metadata = buildWorkerMetadataPayload(bindings, compatibilityDate)
  return uploadWorkerScript(client, name, script, metadata)
}

/**
 * Delete a Worker script.
 *
 * @param client - Authenticated CloudflareClient instance.
 * @param name   - Worker script name to delete.
 */
export async function deleteWorker(
  client: CloudflareClient,
  name: string
): Promise<void> {
  await client.request<void>(
    'DELETE',
    `/workers/scripts/${encodeURIComponent(name)}`
  )
}

/**
 * Get details of a specific Worker script.
 *
 * @param client - Authenticated CloudflareClient instance.
 * @param name   - Worker script name.
 * @returns Worker metadata, or `null` if the Worker does not exist.
 */
export async function getWorker(
  client: CloudflareClient,
  name: string
): Promise<WorkerMetadata | null> {
  try {
    return await client.request<WorkerMetadata>(
      'GET',
      `/workers/scripts/${encodeURIComponent(name)}`
    )
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return null
    }
    throw error
  }
}

/**
 * List all Worker scripts in the account.
 *
 * @param client - Authenticated CloudflareClient instance.
 * @returns Array of Worker metadata objects.
 */
export async function listWorkers(
  client: CloudflareClient
): Promise<WorkerMetadata[]> {
  return client.request<WorkerMetadata[]>('GET', '/workers/scripts')
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface WorkerMetadataPayload {
  main_module: string
  bindings: WorkerBinding[]
  compatibility_date: string
  compatibility_flags: string[]
}

function buildWorkerMetadataPayload(
  bindings: WorkerBinding[],
  compatibilityDate: string = '2024-01-01'
): WorkerMetadataPayload {
  return {
    main_module: 'worker.js',
    bindings,
    compatibility_date: compatibilityDate,
    compatibility_flags: ['nodejs_compat'],
  }
}

async function uploadWorkerScript(
  client: CloudflareClient,
  name: string,
  script: string,
  metadata: WorkerMetadataPayload
): Promise<WorkerMetadata> {
  // Cloudflare's Worker upload API expects a multipart form with:
  //   - "metadata" part: JSON with bindings, main_module, compat settings
  //   - "worker.js" part: the actual script content
  const formData = new FormData()
  formData.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  )
  formData.append(
    'worker.js',
    new Blob([script], { type: 'application/javascript+module' }),
    'worker.js'
  )

  return client.requestRaw<WorkerMetadata>(
    'PUT',
    `/workers/scripts/${encodeURIComponent(name)}`,
    formData
  )
}

async function setWorkerRoutes(
  client: CloudflareClient,
  _name: string,
  routes: WorkerRoute[]
): Promise<void> {
  // Workers routes require a zone_id. Group routes by zone and create each.
  for (const route of routes) {
    if (!route.zone_id) {
      continue
    }
    await client.request<unknown>(
      'POST',
      `/zones/${route.zone_id}/workers/routes`,
      {
        pattern: route.pattern,
        script: _name,
      }
    )
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
