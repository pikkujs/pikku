import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
import { admin, bearer } from 'better-auth/plugins'
import {
  actor,
  credentialOAuth,
  credentialOAuthProviders,
  resolvedUserHoldsScopes,
  ADMIN_SCOPES,
} from '@pikku/better-auth'
import { CREDENTIAL_OAUTH2_CONFIGS } from '#pikku/credentials/pikku-credentials.gen.js'
import { pikkuBetterAuth } from '#pikku/pikku-types.gen.js'

/**
 * Better Auth configuration for the e2e suite. Exercises email+password
 * credentials plus the GitHub social provider and the bearer plugin, all read
 * from the seeded secrets via the typed secret service (the secret types flow
 * from the generated `CredentialsMap`, so no inline generic is needed). The
 * pikku CLI generates the catch-all `/api/auth/**` wiring, the session-bridge
 * middleware, a wireSecret per provider, and the `auth-meta.gen.json` that
 * powers the console SSO page (providers + plugins).
 *
 * Better Auth owns its own user/session/account/verification tables. The suite
 * injects a dedicated in-memory Kysely (see `services.ts`) and runs Better
 * Auth's migrations against it once, on the first auth request — so the schema
 * exists without an external DB. State persists for the lifetime of the server
 * process; scenarios use unique emails rather than resetting.
 */
let migrated: Promise<void> | undefined

export const auth = pikkuBetterAuth(
  async ({ secrets, variables, kysely, logger, scopeService }) => {
    const baseURL = (await variables.get('API_URL')) ?? 'http://localhost:4077'
    const consoleURL =
      (await variables.get('CONSOLE_URL')) ?? 'http://localhost:7071'
    const instance = betterAuth({
      secret: await secrets.getSecret('BETTER_AUTH_SECRET'),
      baseURL,
      // Console signs in cross-origin; without this better-auth rejects the POST.
      trustedOrigins: [baseURL, consoleURL],
      database: { db: kysely, type: 'sqlite' },
      emailAndPassword: {
        enabled: true,
        // The e2e fixtures use short passwords (≥7 chars); keep the floor below
        // them so valid signups are not rejected on length.
        minPasswordLength: 6,
      },
      socialProviders: {
        github: await secrets.getSecret('GITHUB_OAUTH'),
      },
      // Admin capabilities (impersonation, the user directory, singleton
      // credential links) are gated on the `admin` scope tree, not on
      // better-auth's admin() plugin. The tree itself is declared by
      // @pikku/addon-console's wireScope, which this app inherits.
      //
      // admin() is wired only for what pikku does NOT implement itself: ban,
      // delete, session revocation and set-password. Its `role` column is never
      // read as an authorization signal — `syncProjectedAdminRole` maintains it
      // as a projection of the caller's `admin:users:*` scopes so those
      // endpoints unlock for exactly the people the scope store says they should.
      plugins: [
        admin(),
        bearer(),
        actor({
          secret: (await variables.get('SCENARIO_ACTOR_SECRET')) ?? '',
        }),
        // Every wireCredential oauth2 declaration becomes a provider here, so
        // linking an account is what makes getCredential(name) resolve.
        credentialOAuth({
          config: await credentialOAuthProviders(
            CREDENTIAL_OAUTH2_CONFIGS,
            secrets,
            logger
          ),
          scopeService,
          logger,
          // Connecting a singleton rebinds it for everyone, so the app decides
          // who may. The realistic gate is the `admin:credentials:link` scope,
          // which the seeded console admin holds. The 'root' escape is kept for
          // the link suite: it signs a user up mid-scenario under a throwaway
          // email, so there is no seeding pass in which a scope could have been
          // granted to it.
          canLinkSingleton: async (session) =>
            (await resolvedUserHoldsScopes(
              session.user.id,
              [ADMIN_SCOPES.credentialsLink],
              scopeService,
              logger
            )) || session.user.name === 'root',
        }),
      ],
    })

    migrated ??= getMigrations(instance.options).then(({ runMigrations }) =>
      runMigrations()
    )
    await migrated

    return instance
  }
)
