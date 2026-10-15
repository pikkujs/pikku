import { betterAuth } from 'better-auth'
import {
  VIRTUAL_USER_SIGN_IN_OPT_IN_ENV,
  pikkuVirtualUser,
  pikkuBan,
} from '@pikku/better-auth'
import { pikkuBetterAuth } from '#pikku/auth'
import { virtualUserList } from '#pikku/scenarios/pikku-virtual-users.gen.js'

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
    // The public half of this stage's virtual user key pair, from the deployer; `pikku dev`
    // sets it for you. Without it the app registers no endpoint for callers outside it
    // (and says so at boot). Runs inside the app do not need it.
    const VIRTUAL_USER_VERIFY_KEY = await variables.get(
      'VIRTUAL_USER_VERIFY_KEY'
    )
    // The opt-in that lets a deployed stage run scenarios. Read through
    // `variables` rather than left to `process.env`, because a Worker receives
    // it as a binding and has no populated environment to find it in.
    const ALLOW_VIRTUAL_USER_SIGN_IN = await variables.get(
      VIRTUAL_USER_SIGN_IN_OPT_IN_ENV
    )

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
      // Scenario virtual users: synthetic users (user.virtualUser = true, see
      // db/sqlite/0001-better-auth.sql) signed in by pikkuScenario via
      // POST /api/auth/sign-in/virtual-user { email, secret }. Never signs in real users.
      //
      // pikkuBan(): adds the banned/banExpires/banReason columns (see
      // db/sqlite/0003-admin.sql) and the session hook that refuses a banned
      // user a session. better-auth's own admin() is refused by the inspector:
      // it authorizes on a `user.role` column while pikku authorizes on scopes,
      // and everything else it offered — list, create, ban, remove, revoke
      // sessions, set password — is scoped RPCs in @pikku/addon-admin.
      plugins: [
        // @snippet start virtualUserSignIn
        pikkuVirtualUser({
          verifyKey: VIRTUAL_USER_VERIFY_KEY,
          allowSignIn: ALLOW_VIRTUAL_USER_SIGN_IN,
          virtualUserSignIn: {
            virtualUsers: virtualUserList,
          },
        }),
        // @snippet end virtualUserSignIn
        pikkuBan(),
      ],
    })
  }
)

// @snippet end betterAuthConfig
