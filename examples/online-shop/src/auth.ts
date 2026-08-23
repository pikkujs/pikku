import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { actor, fabric } from '@pikku/better-auth'
import { pikkuBetterAuth } from '#pikku/auth'

/**
 * Better Auth configuration — email + password sign-in.
 *
 * `pikkuBetterAuth` has no side effects: the pikku CLI statically inspects this single
 * exported `auth` const and generates the catch-all `/api/auth/**` HTTP wiring,
 * the session-bridge middleware, and a `defineSecret` for `BETTER_AUTH_SECRET` (and
 * one per social provider, if you add any) — so the auth routes and secret
 * requirements flow through normal inspection into the deploy manifest.
 *
 * The factory runs once when singleton services are built, pulling the secret
 * (and the database) off the injected `services`; the resolved instance is then
 * available to every function as `services.auth`. Better Auth is given the app's
 * own kysely: the CamelCasePlugin maps Better Auth's camelCase field names onto
 * the snake_case columns created in db/sqlite/0001-init.sql, keeping the whole DB
 * on one naming convention. To offer Google / GitHub / ... add a `socialProviders`
 * entry (and a button on the login page) — the CLI will wire its secret too.
 */
// The factory receives the FULL singleton services (emailService, logger, …) —
// destructure whatever you need, e.g. `{ kysely, secrets, emailService }` to wire
// sendResetPassword/verification emails. It runs lazily after all services exist,
// so never re-construct a service here or reach for a dynamic import.
// @snippet start betterAuthConfig
export const auth = pikkuBetterAuth(
  async ({ kysely, secrets, variables, emailService }) => {
    // `.reveal()` at the sink, not earlier: getSecret hands back a nominal
    // SecretValue that no concretely-typed parameter accepts, so every disclosure
    // is one greppable call. Better Auth wants the raw string, and this is where
    // it stops being a secret in the type system.
    const BETTER_AUTH_SECRET = (
      await secrets.getSecret('BETTER_AUTH_SECRET')
    ).reveal()
    // Genuinely optional: unset simply disables /api/auth/sign-in/actor (scenarios
    // off for this deployment) — the actor plugin refuses all sign-ins
    // without it.
    const SCENARIO_ACTOR_SECRET = await secrets
      .getSecret('SCENARIO_ACTOR_SECRET')
      .then((value) => value?.reveal())
      .catch(() => undefined)
    // Fabric operator admin: the RSA public key the control plane's token is
    // verified against. The Fabric deployer pushes FABRIC_AUTH_PUBLIC_KEY onto
    // every stage; locally it's simply absent, which disables /sign-in/fabric.
    // Asymmetric — the app verifies, it can never forge an operator login.
    const FABRIC_AUTH_PUBLIC_KEY = await variables.get('FABRIC_AUTH_PUBLIC_KEY')

    return betterAuth({
      secret: BETTER_AUTH_SECRET,
      database: { db: kysely, type: 'sqlite' },
      emailAndPassword: {
        enabled: true,
        // Without this, `requestPasswordReset` succeeds on the client and silently
        // sends nothing — the "Forgot password?" flow looks wired and dead-ends.
        // Better Auth builds `url` from its baseURL + the client's redirectTo, so
        // the app only supplies the message. Errors are logged, never swallowed:
        // a reset the user never receives must be visible in the logs.
        sendResetPassword: async ({ user, url }) => {
          await emailService.send({
            to: user.email,
            template: {
              name: 'reset-password',
              data: { email: user.email, resetUrl: url },
            },
          })
        },
      },
      // Stateless session: CLI splits out betterAuthStatelessSession so non-auth
      // units verify the signed cookie instead of bundling better-auth. pikku #737.
      session: { cookieCache: { enabled: true } },
      advanced: { database: { generateId: 'uuid' } },
      // Scenario actors: synthetic users (user.actor = true, see
      // db/sqlite/0002-user-actor.sql) signed in by pikkuScenario via
      // POST /api/auth/sign-in/actor { email, secret }. Never signs in real users.
      //
      // admin(): exposes /api/auth/admin/* (listUsers, setRole, impersonateUser,
      // …) so an app admin can list and "view as" their end-users — this is what
      // the Fabric console's Users tab drives. Adds role/banned/impersonatedBy
      // columns (see db/sqlite/0003-admin.sql). No user is an admin by default:
      // grant it by setting a user's `role` to 'admin' (or pass
      // `adminUserIds: [...]` here) — the admin API refuses non-admins.
      //
      // fabric(): exposes /api/auth/sign-in/fabric — the Fabric control plane
      // mints a short-lived RS256 token and signs in as a synthetic `fabric: true`
      // admin operator (db/sqlite/0004-fabric.sql), so the console Users tab can
      // list/impersonate real users without the operator being one of them. It
      // pairs with admin() and verifies against FABRIC_AUTH_PUBLIC_KEY; missing
      // key disables the endpoint.
      plugins: [
        actor({ secret: SCENARIO_ACTOR_SECRET }),
        admin(),
        fabric({ publicKey: FABRIC_AUTH_PUBLIC_KEY }),
      ],
    })
  }
)

// @snippet end betterAuthConfig
