import { pikkuService } from '@pikku/core/pikku-service'

/** Stands in for the platform's own `kysely` so column coercion has something to decorate. */
export const kyselyFake = pikkuService({
  deploy: () => {
    const db = {
      plugins: [] as unknown[],
      withPlugin(plugin: unknown) {
        return { ...db, plugins: [...db.plugins, plugin] }
      },
    }
    return { kysely: db }
  },
})
