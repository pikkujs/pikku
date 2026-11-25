import { defineProvider } from '@pikku/core/provider'

/** Stands in for the platform's own `kysely` so column coercion has something to decorate. */
export const kyselyFake = defineProvider({
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
