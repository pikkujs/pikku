import { pikkuPlatformServices } from '@pikku/core/lifecycle'

/** A host's platform services: it swaps `hookC` without touching the app. */
export const createPlatformServices = pikkuPlatformServices<{
  hookC: { tag: string | undefined }
}>((env) => ({ hookC: { tag: env.PIKKU_HOST_TAG } }))
