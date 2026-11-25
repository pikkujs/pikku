import { defineProvider } from '@pikku/core/provider'
import { CamelCasePlugin, Kysely, MysqlDialect } from '@pikku/addon-kysely'
import { createPool } from 'mysql2'

const connect = (env: Record<string, unknown>) => {
  const url = env.DATABASE_URL
  if (typeof url !== 'string' || !url) {
    throw new Error(
      'The mysql kysely service needs DATABASE_URL, the connection string of the database.'
    )
  }
  return {
    kysely: new Kysely<any>({
      dialect: new MysqlDialect({ pool: createPool(url) }),
      plugins: [new CamelCasePlugin()],
    }),
  }
}

/**
 * The project's `kysely` over MySQL. Standalone deploys open their own
 * database, so there is deliberately no `deploy:standalone` variant.
 */
export const kysely = defineProvider({
  dev: (_services, env) => connect(env),
  'deploy:cloudflare-container': (_services, env) => connect(env),
})
