import { betterAuth } from 'better-auth'
import { admin, organization, twoFactor } from 'better-auth/plugins'
import { pikkuBetterAuth } from '#pikku'

/**
 * Better Auth with plugins that change the schema, which is the point.
 *
 * A four-table core is easy to hardcode and would pass a test that only ever
 * saw one. `organization()` adds three tables of its own, `twoFactor()` a
 * fourth, and `admin()` adds columns to `user` and `session` rather than tables
 * — so a generator that special-cases table creation but not column addition
 * fails here. The auth source has to be the schema Better Auth materializes.
 *
 * `type` decides which dialect's DDL Better Auth emits, and it has to agree with
 * the scratch database the CLI hands over — PGlite for postgres, sqlite
 * otherwise. Getting it wrong is not a type error; it is postgres DDL compiled
 * against sqlite.
 *
 * `generateId: 'uuid'` is what makes `user.id` a real `uuid` on postgres — the
 * default is `text` on both dialects. It is set because the scope tables'
 * foreign key to `user.id` is only interesting when the referenced type is not
 * the `text` a hand-written migration would have guessed: postgres rejects a
 * `text` column referencing a `uuid` one outright. SQLite ignores the option
 * and stays `text`, so one config exercises both sides.
 *
 * Nothing runs migrations at boot. `pikku db generate` writes them down and
 * `pikku db migrate` applies them; that is the behaviour under test.
 */
export const auth = pikkuBetterAuth(async ({ secrets, kysely, config }) =>
  betterAuth({
    secret: (await secrets.getSecret('BETTER_AUTH_SECRET')).reveal(),
    baseURL: 'http://localhost',
    database: {
      db: kysely,
      type: config.postgresUrl ? 'postgres' : 'sqlite',
    },
    emailAndPassword: { enabled: true },
    advanced: { database: { generateId: 'uuid' } },
    plugins: [organization(), admin(), twoFactor()],
  })
)
