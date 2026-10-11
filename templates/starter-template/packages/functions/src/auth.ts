import { betterAuth } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import { ACTOR_SIGN_IN_OPT_IN_ENV, pikkuActor, pikkuBan } from '@pikku/better-auth'
import { pikkuBetterAuth } from '#pikku/auth'
import { sessionCookieCacheMaxAge } from './lib/session-cookie.js'
import { personaList } from '#pikku/scenarios/pikku-personas.gen.js'

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
 * the snake_case columns created in db/sqlite/0001-better-auth.sql, keeping the whole DB
 * on one naming convention. To offer Google / GitHub / ... add a `socialProviders`
 * entry (and a button on the login page) — the CLI will wire its secret too.
 */
// The factory receives the FULL singleton services (emailService, logger, …) —
// destructure whatever you need, e.g. `{ kysely, secrets, emailService }` to wire
// sendResetPassword/verification emails. It runs lazily after all services exist,
// so never re-construct a service here or reach for a dynamic import.
export const auth = pikkuBetterAuth(
  async ({ kysely, secrets, variables, emailService, featureFlags, logger }) => {
    // `.reveal()` at the sink, not earlier: getSecret hands back a nominal
    // SecretValue that no concretely-typed parameter accepts, so every disclosure
    // is one greppable call. Better Auth wants the raw string, and this is where
    // it stops being a secret in the type system.
    const BETTER_AUTH_SECRET = (await secrets.getSecret('BETTER_AUTH_SECRET')).reveal()
    // Optional: the secret alone never opens /api/auth/sign-in/actor. The plugin
    // gates on `pikku dev`, or on the opt-in below for a stage meant to run
    // scenarios, and warns when a secret is set against a shut gate.
    const SCENARIO_ACTOR_SECRET = await secrets
      .getSecret('SCENARIO_ACTOR_SECRET')
      .then((value) => value?.reveal())
      .catch(() => undefined)
    // The scenario opt-in, read through `variables` rather than left to
    // process.env: the host pushes it as a binding on every non-production stage,
    // and a Worker has no populated environment for the plugin to find it in.
    const ALLOW_ACTOR_SIGN_IN = await variables.get(ACTOR_SIGN_IN_OPT_IN_ENV)

    // How long the signed session cookie is trusted, in seconds. Declared (with its
    // default and the reasoning) in lib/session-cookie.ts, because the number is a
    // policy decision an operator may want to change per stage.
    const SESSION_COOKIE_CACHE_MAX_AGE = await sessionCookieCacheMaxAge(variables, logger)

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
      //
      // `maxAge` is NOT optional here, whatever better-auth's own docs imply. In a
      // normal better-auth app session_data is a cache in front of the database,
      // rewritten on every /api/auth/get-session, so its 300s default never shows.
      // Under the stateless middleware that cookie is the ONLY thing that
      // authenticates a request — no database behind it — and the app calls no
      // /api/auth/* route in normal use, so nothing rewrote it. The default
      // therefore signed everyone out five minutes after they logged in, while
      // their session_token was still good for a week.
      //
      // The value, its default of one day, and what it costs to change are all in
      // lib/session-cookie.ts. It is not how long a user stays signed in:
      // apps/app/src/lib/session-refresh.ts re-mints the cookie while the app is
      // open and heals an expired one, so someone using the app is never signed
      // out, and each refresh is the moment a ban lands.
      session: { cookieCache: { enabled: true, maxAge: SESSION_COOKIE_CACHE_MAX_AGE } },
      advanced: { database: { generateId: 'uuid' } },
      // Scenario actors: synthetic users (user.actor = true, see
      // db/sqlite/0001-better-auth.sql) signed in by pikkuScenario via
      // POST /api/auth/sign-in/actor { email, secret }. Never signs in real users.
      //
      // ban(): the enforcement half of better-auth's admin() plugin — the
      // banned/banReason/banExpires columns (see db/sqlite/0001-better-auth.sql) and the
      // session hook that refuses a banned user a session. It makes no
      // authorization decision: who may ban is decided by the `admin:users:ban`
      // scope on the RPC. Listing, banning and "view as" are @pikku/addon-admin's
      // scoped RPCs (src/addons/admin.addon.ts), which is what the console's Users
      // tab calls — administering an app is ordinary application behaviour and
      // must not depend on better-auth's `role` column.
      //
      plugins: [
        // Email sign-in links, and — with `disableSignUp: true` — the invite
        // flow. THE FLAG IS THE WHOLE SEMANTIC:
        //
        //   disableSignUp: true  (shipped)  a link only ever signs in an email
        //                                   that ALREADY has a user row, so
        //                                   sending one IS the invitation:
        //                                   create the user with no password
        //                                   (admin:createUser takes none), grant
        //                                   their roles, mail them a link. An
        //                                   unknown address is refused with
        //                                   `new_user_signup_disabled`.
        //
        //   disableSignUp: false            a link to an unknown address CREATES
        //                                   the user and signs them in. That is
        //                                   passwordless public sign-up, not an
        //                                   invite — flip it only if anyone may
        //                                   join, and reword the magic-link email
        //                                   accordingly.
        //
        // Either way the click sets emailVerified, so acceptance doubles as
        // verification. Seven days because an invite sits in an inbox until
        // someone gets round to it; the plugin's own default is five minutes,
        // which is right for a sign-in link and useless for an invitation.
        magicLink({
          disableSignUp: true,
          expiresIn: 60 * 60 * 24 * 7,
          storeToken: 'hashed',
          sendMagicLink: async ({ email, url }) => {
            await emailService.send({
              to: email,
              template: {
                name: 'magic-link',
                data: { email, signInUrl: url },
              },
            })
          },
        }),
        pikkuActor({
          secret: SCENARIO_ACTOR_SECRET,
          allowSignIn: ALLOW_ACTOR_SIGN_IN,
          personaSignIn: {
            personas: personaList,
            featureFlags,
          },
        }),
        pikkuBan(),
      ],
    })
  },
)
