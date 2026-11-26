/** A host's platform services: it swaps `hookC` without touching the app. */
export const createPlatformServices = (
  env: Record<string, string | undefined>
) => ({ hookC: { tag: env.PIKKU_HOST_TAG } })
