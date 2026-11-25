import { defineProvider } from '@pikku/core/provider'
import { Kysely } from 'kysely'
import { LibsqlWebDialect } from './libsql-web-dialect.js'
import { CamelCasePlugin } from '@pikku/addon-kysely'

const connect = (env: Record<string, unknown>) => {
  const url = env.LIBSQL_URL
  if (typeof url !== 'string' || !url) {
    throw new Error(
      'The sqlite kysely service needs LIBSQL_URL, the URL of the libSQL database.'
    )
  }
  const authToken = env.LIBSQL_AUTH_TOKEN
  const db = new Kysely<any>({
    dialect: new LibsqlWebDialect({
      url,
      authToken: typeof authToken === 'string' ? authToken : undefined,
    }),
    plugins: [new CamelCasePlugin()],
  })
  return { kysely: Object.assign(db, { stop: () => db.destroy() }) }
}

/**
 * The project's `kysely` over libSQL's HTTP protocol, which runs wherever
 * `fetch` does. Standalone deploys open their own database, so there is
 * deliberately no `deploy:standalone` variant.
 */
export const kysely = defineProvider({
  dev: (_services, env) => connect(env),
  'deploy:cloudflare-worker': (_services, env) => connect(env),
  'deploy:cloudflare-container': (_services, env) => connect(env),
})
