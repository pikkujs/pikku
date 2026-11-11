import { betterAuth } from 'better-auth'
import { pikkuBetterAuth } from '@pikku/better-auth'
import type { CoreConfig, CoreSingletonServices } from '@pikku/core/types'
import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from '@pikku/kysely'

/**
 * Better Auth configuration.
 *
 * The pikku CLI inspects this `pikkuBetterAuth` export and generates the catch-all
 * `/api/auth/**` HTTP wiring, the session-bridge middleware, and a `defineSecret`
 * for every configured social provider — so the auth routes and secret
 * requirements flow through normal inspection into the deploy manifest.
 *
 * The factory runs lazily on the first auth request, so it pulls secrets and the
 * Kysely database off the injected `services`. Better Auth owns its own tables
 * (user/session/account/verification); run `pikku db migrate` to materialise
 * them. Each runtime injects its own `kysely` singleton (a SQLite/Postgres
 * Kysely on node, a D1-backed Kysely on Cloudflare Workers).
 */
export const auth = pikkuBetterAuth(
  async ({
    config,
    secrets,
    kysely,
  }: CoreSingletonServices<CoreConfig & { postgresUrl?: string }> & {
    kysely: Kysely<KyselyPikkuDB>
  }) => {
    // Fetch every secret in one batch rather than awaiting each individually.
    const { BETTER_AUTH_SECRET, GITHUB_OAUTH } = await secrets.getSecrets<{
      BETTER_AUTH_SECRET: string
      GITHUB_OAUTH: { clientId: string; clientSecret: string }
    }>(['BETTER_AUTH_SECRET', 'GITHUB_OAUTH'])

    // Reveal before the guard: a `SecretValue` wrapper is always truthy, so
    // testing it would let an empty secret through.
    const betterAuthSecret = BETTER_AUTH_SECRET?.reveal()
    if (!betterAuthSecret) {
      throw new Error('Missing required secret: BETTER_AUTH_SECRET')
    }

    return betterAuth({
      secret: betterAuthSecret,
      database: {
        db: kysely,
        // The dialect Better Auth introspects with has to be the one the
        // injected Kysely actually speaks: it runs dialect-specific index
        // queries, and asking a Postgres database a `pragma_index_list`
        // question fails outright. `postgresUrl` is the same flag `pikku db
        // migrate` resolves the app database from.
        type: config.postgresUrl ? 'postgres' : 'sqlite',
      },
      emailAndPassword: { enabled: true },
      // Enables the stateless session middleware split (CLI detects this), so
      // non-auth workers skip bundling the full better-auth server.
      session: { cookieCache: { enabled: true } },
      socialProviders: {
        ...(GITHUB_OAUTH ? { github: GITHUB_OAUTH.reveal() } : {}),
      },
    })
  }
)
