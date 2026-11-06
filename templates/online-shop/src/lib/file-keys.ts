/**
 * Where uploaded files go, and what they are called.
 *
 * A bucket is just a name that groups related files, and goes through the
 * `content` service rather than a storage SDK.
 */
export const BUCKET = 'shop'

/**
 * Build a safe, namespaced storage key.
 *
 * Two rules, both of which matter more than they look. Private files live
 * under the owner's id so nobody can guess their way into someone else's, and
 * the uuid stops both collisions and name-guessing. The client's own file name
 * survives only as a sanitised suffix — using it as the key is how a caller
 * gets to choose where their bytes land.
 */
export const buildFileKey = (
  visibility: 'public' | 'private',
  ownerId: string,
  fileName: string
): string => {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const prefix = visibility === 'public' ? 'public' : ownerId
  // Global crypto, not `node:crypto`: this same function runs in a Cloudflare
  // Worker, where the node module does not resolve.
  return `${prefix}/${crypto.randomUUID()}-${safeName}`
}
