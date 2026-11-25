import { defineProvider } from '@pikku/core/provider'
import type { Logger } from '@pikku/core/services'
import { PikkuKysely } from './pikku-kysely.js'

const connect = async (logger: Logger, env: Record<string, unknown>) => {
  const url = env.DATABASE_URL
  if (typeof url !== 'string' || !url) {
    throw new Error(
      'The postgres kysely service needs DATABASE_URL, the connection string of the database.'
    )
  }
  const database = new PikkuKysely<any>(logger, url)
  await database.init()
  return { kysely: database.kysely }
}

/**
 * The project's `kysely` over Postgres. Standalone deploys open their own
 * database, so there is deliberately no `deploy:standalone` variant.
 */
export const kysely = defineProvider({
  dev: ({ logger }, env) => connect(logger, env),
  'deploy:cloudflare-container': ({ logger }, env) => connect(logger, env),
})
