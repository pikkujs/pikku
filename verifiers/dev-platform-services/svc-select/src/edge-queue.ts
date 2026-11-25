import { defineProvider } from '@pikku/core/provider'

/**
 * Needs a Cloudflare queue binding, which only a Worker's env carries. The
 * guard is in the factory, so a container (env only) fails closed when it
 * starts rather than the build knowing about Cloudflare.
 */
export const edgeQueue = defineProvider({
  dev: () => ({ edgeQueue: 'dev-queue' }),
  deploy: ({}, env) => {
    if (!env.QUEUE) {
      throw new Error('edgeQueue: the QUEUE binding is missing')
    }
    return { edgeQueue: env.QUEUE }
  },
})
