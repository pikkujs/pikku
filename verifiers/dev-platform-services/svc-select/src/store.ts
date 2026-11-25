import { defineProvider } from '@pikku/core/provider'

const engineOf = (kysely: any): 'postgres' | 'sqlite' | 'unknown' => {
  const adapter: string = kysely.getExecutor().adapter.constructor.name
  if (/postgres/i.test(adapter)) return 'postgres'
  if (/sqlite/i.test(adapter)) return 'sqlite'
  return 'unknown'
}

/**
 * One service for every database engine: it reads the `kysely` the target
 * already holds and branches on its dialect, instead of one service per engine
 * told apart by a `when`. A target with no database has no `kysely`, so the
 * need is unmet and the build says so.
 */
export const store = defineProvider({
  dev: ({ kysely }) => ({ store: { engine: engineOf(kysely), target: 'dev' } }),
  deploy: ({ kysely }) => ({
    store: { engine: engineOf(kysely), target: 'deploy' },
  }),
})
