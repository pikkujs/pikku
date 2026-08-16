import { pikkuServerLifecycle } from '@pikku/core/utils'
import type { SingletonServices } from '../types/application-types.js'

/**
 * Server lifecycle hooks, run by `pikku dev` and `pikku serve`.
 *
 * Every hook is optional and receives the singleton services after they have
 * been created, so startup work that needs a service — migrations, seeding,
 * warming a cache, starting a consumer — belongs here rather than in the
 * service factory.
 *
 * Order is beforeStart -> server starts -> afterStart, then on shutdown
 * beforeStop -> services stopped -> server stopped -> afterStop. Note that
 * afterStop runs once the services are already stopped, so anything needing a
 * live service goes in beforeStop.
 *
 * Runtimes that own their own entrypoint (Express, Fastify, uWS, Lambda,
 * Cloudflare, Next.js) do not run these hooks — do that work in start.ts.
 */
export const lifecycle = pikkuServerLifecycle<SingletonServices>({
  afterStart: async ({ logger }) => {
    logger.info('Todo server ready')
  },
})
