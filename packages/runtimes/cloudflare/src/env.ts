export type CloudflareEnv = Record<string, unknown>

let cachedEnv: CloudflareEnv | null = null

/**
 * Returns the Cloudflare `env` that was last passed into the worker handler,
 * or `null` if called before any request. Lets user `createSingletonServices`
 * read CF-specific bindings (D1, R2, KV, queue producers, etc.) without
 * threading `env` through every signature.
 *
 * Lives in its own module — no `cloudflare:workers` import — so Node-target
 * bundles (e.g. the container server entry) can safely import it.
 */
export function getCloudflareEnv(): CloudflareEnv | null {
  return cachedEnv
}

export function setCloudflareEnv(env: CloudflareEnv): void {
  cachedEnv = env
}
