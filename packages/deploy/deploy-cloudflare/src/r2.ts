import type { CloudflareClient } from './client.js'
import type { R2BucketMetadata } from './types.js'

/**
 * Create a new R2 bucket.
 *
 * @param client - Authenticated CloudflareClient instance.
 * @param name   - Bucket name (must be globally unique, 3-63 characters).
 * @returns Bucket metadata from the API.
 */
export async function createBucket(
  client: CloudflareClient,
  name: string
): Promise<R2BucketMetadata> {
  return client.request<R2BucketMetadata>('POST', '/r2/buckets', { name })
}

/**
 * Delete an R2 bucket.
 *
 * The bucket must be empty before it can be deleted.
 *
 * @param client - Authenticated CloudflareClient instance.
 * @param name   - Bucket name to delete.
 */
export async function deleteBucket(
  client: CloudflareClient,
  name: string
): Promise<void> {
  await client.request<void>(
    'DELETE',
    `/r2/buckets/${encodeURIComponent(name)}`
  )
}

/**
 * List all R2 buckets in the account.
 *
 * @param client - Authenticated CloudflareClient instance.
 * @returns Array of bucket metadata objects.
 */
export async function listBuckets(
  client: CloudflareClient
): Promise<R2BucketMetadata[]> {
  const result = await client.request<{ buckets: R2BucketMetadata[] }>(
    'GET',
    '/r2/buckets'
  )
  return result.buckets
}
