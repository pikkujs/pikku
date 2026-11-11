import type { Contributor } from '@pikku/core/contributors'

/** Needs a Cloudflare binding, so only a target that supplies one can build it. */
export const edgeQueueDeploy: Contributor = {
  provides: ['edgeQueue'],
  requires: ['cloudflare'],
  run: (services, env) => {
    services.edgeQueue = env.QUEUE
  },
}

/** Stands in for the platform's own kysely contributor. */
export const kyselyFakeDeploy: Contributor = {
  provides: ['kysely'],
  run: (services) => {
    const db = {
      plugins: [] as unknown[],
      withPlugin(plugin: unknown) {
        return { ...db, plugins: [...db.plugins, plugin] }
      },
    }
    services.kysely = db
  },
}
