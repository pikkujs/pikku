import type { CloudflareClient } from './client.js'
import type { D1DatabaseMetadata, D1QueryResult } from './types.js'

/**
 * Create a new D1 database.
 *
 * @param client - Authenticated CloudflareClient instance.
 * @param name   - Database name (must be unique within the account).
 * @returns Database metadata from the API.
 */
export async function createDatabase(
  client: CloudflareClient,
  name: string
): Promise<D1DatabaseMetadata> {
  return client.request<D1DatabaseMetadata>('POST', '/d1/database', { name })
}

/**
 * Delete a D1 database.
 *
 * @param client     - Authenticated CloudflareClient instance.
 * @param databaseId - The database UUID to delete.
 */
export async function deleteDatabase(
  client: CloudflareClient,
  databaseId: string
): Promise<void> {
  await client.request<void>(
    'DELETE',
    `/d1/database/${encodeURIComponent(databaseId)}`
  )
}

/**
 * Execute a SQL query against a D1 database.
 *
 * Primarily used for running migration SQL during deploys. The query
 * is executed in a single batch — for multi-statement migrations,
 * call this function once per statement or use D1's semicolon-delimited
 * batch format.
 *
 * @param client     - Authenticated CloudflareClient instance.
 * @param databaseId - The database UUID.
 * @param sql        - SQL statement(s) to execute.
 * @param params     - Optional positional bind parameters.
 * @returns Query result with rows and execution metadata.
 */
export async function executeQuery(
  client: CloudflareClient,
  databaseId: string,
  sql: string,
  params: unknown[] = []
): Promise<D1QueryResult[]> {
  return client.request<D1QueryResult[]>(
    'POST',
    `/d1/database/${encodeURIComponent(databaseId)}/query`,
    { sql, params }
  )
}

/**
 * List all D1 databases in the account.
 *
 * @param client - Authenticated CloudflareClient instance.
 * @returns Array of database metadata objects.
 */
export async function listDatabases(
  client: CloudflareClient
): Promise<D1DatabaseMetadata[]> {
  return client.request<D1DatabaseMetadata[]>('GET', '/d1/database')
}

/**
 * Get details of a specific D1 database.
 *
 * @param client     - Authenticated CloudflareClient instance.
 * @param databaseId - The database UUID.
 * @returns Database metadata, or `null` if the database does not exist.
 */
export async function getDatabase(
  client: CloudflareClient,
  databaseId: string
): Promise<D1DatabaseMetadata | null> {
  try {
    return await client.request<D1DatabaseMetadata>(
      'GET',
      `/d1/database/${encodeURIComponent(databaseId)}`
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
