import { betterAuth } from 'better-auth'
import { organization, twoFactor } from 'better-auth/plugins'
import { pikkuBan } from '@pikku/better-auth'
import { pikkuBetterAuth } from '#pikku/auth'

/**
 * Better Auth with plugins that change the schema, which is the point.
 *
 * A four-table core is easy to hardcode and would pass a test that only ever
 * saw one. `organization()` adds three tables of its own, `twoFactor()` a
 * fourth, and `pikkuBan()` adds columns to `user` rather than tables of its own — so a
 * generator that special-cases table creation but not column addition fails
 * here. The auth source has to be the schema Better Auth materializes.
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
 *
 * The secret arrives through the batch `getSecrets`, the form an app reaching
 * for more than one of them uses. Schema introspection runs this factory
 * against a stub secret service, so every method a real factory might call has
 * to be on it — a missing one throws before Better Auth is ever constructed,
 * and the migration is never written.
 */
export const auth = pikkuBetterAuth(async ({ secrets, kysely, config }) => {
  const { BETTER_AUTH_SECRET } = await secrets.getSecrets<{
    BETTER_AUTH_SECRET: string
  }>(['BETTER_AUTH_SECRET'])

  return betterAuth({
    secret: BETTER_AUTH_SECRET!.reveal(),
    baseURL: 'http://localhost',
    database: {
      db: kysely,
      type: config.postgresUrl ? 'postgres' : 'sqlite',
    },
    emailAndPassword: { enabled: true },
    advanced: { database: { generateId: 'uuid' } },
    plugins: [organization(), pikkuBan(), twoFactor()],
  })
})
